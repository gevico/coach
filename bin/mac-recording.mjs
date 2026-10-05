import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const activeStatuses = new Set(['preparing', 'countdown', 'recording', 'stopping']);
const helperSource = fileURLToPath(new URL('./mac-canvas.swift', import.meta.url));

export async function createMacRecorder({ directory: initialDirectory } = {}) {
  const defaultDirectory = path.join(homedir(), 'Movies', 'Coach');
  const settingsFile = path.join(homedir(), 'Library', 'Application Support', 'Coach', 'recording.json');
  let directory = defaultDirectory;
  if (initialDirectory === undefined) {
    try {
      const settings = JSON.parse(await readFile(settingsFile, 'utf8'));
      if (typeof settings.directory !== 'string' || !settings.directory.trim() || !path.isAbsolute(settings.directory)) {
        throw new Error('保存目录需要是完整路径。');
      }
      directory = settings.directory;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`无法读取录像目录配置 ${settingsFile}：${error.message}`);
    }
  } else directory = resolveDirectory(initialDirectory);
  const token = randomUUID();
  let state = { available: process.platform === 'darwin', status: 'idle', token, microphone: true, directory, defaultDirectory, directoryBusy: false };
  let compilation;
  let child;
  let timer;
  let monitor;
  let movie;
  let capture;
  let discard;
  let origin;
  let operation = 0;
  let completion;

  const snapshot = () => ({ ...state });
  const update = (values) => { state = { ...state, ...values }; };

  function resolveDirectory(value) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('请输入录像保存目录。');
    const input = value.trim();
    return path.resolve(input === '~' ? homedir() : input.startsWith('~/') ? path.join(homedir(), input.slice(2)) : input);
  }

  async function saveDirectory(value) {
    const next = resolveDirectory(value);
    try {
      await mkdir(next, { recursive: true });
      await access(next, constants.W_OK);
    } catch (error) { throw new Error(`无法使用录像保存目录 ${next}：${error.message}`); }
    await mkdir(path.dirname(settingsFile), { recursive: true });
    const pending = path.join(path.dirname(settingsFile), `.recording-${randomUUID()}.json`);
    try {
      await writeFile(pending, `${JSON.stringify({ directory: next }, null, 2)}\n`, { mode: 0o600 });
      await rename(pending, settingsFile);
    } finally { await rm(pending, { force: true }); }
    directory = next;
    update({ directory });
  }

  async function configureDirectory(value, choose = false) {
    if (!state.available) throw new Error('录像目录设置需要 macOS。');
    if (activeStatuses.has(state.status) || state.directoryBusy) throw new Error('请在录制结束后设置保存目录。');
    update({ directoryBusy: true });
    let cancelled = false;
    try {
      if (choose) {
        const executable = await helper();
        const bundle = path.join(path.dirname(executable), 'Coach Recorder.app');
        const picker = path.join(bundle, 'Contents', 'MacOS', 'mac-canvas');
        await mkdir(path.dirname(picker), { recursive: true });
        await copyFile(executable, picker);
        await run(executable, ['--picker-info', path.join(bundle, 'Contents', 'Info.plist')], { timeout: 15000 });
        const selection = path.join(path.dirname(executable), `directory-${randomUUID()}.json`);
        let selected;
        try {
          await run('/usr/bin/open', ['-W', '-n', bundle, '--args', '--choose-directory', directory, selection], { timeout: 600000 });
          selected = JSON.parse(await readFile(selection, 'utf8'));
        } finally { await rm(selection, { force: true }); }
        cancelled = selected.cancelled === true;
        value = selected.directory;
      }
      if (!cancelled) await saveDirectory(value);
    } finally { update({ directoryBusy: false }); }
    return { ...snapshot(), ...(cancelled ? { cancelled: true } : {}) };
  }

  async function openDirectory() {
    if (activeStatuses.has(state.status) || state.directoryBusy) throw new Error('请在录制结束后打开保存目录。');
    await mkdir(directory, { recursive: true });
    await run('/usr/bin/open', [directory]);
  }

  async function helper() {
    if (!compilation) {
      compilation = (async () => {
        const source = await readFile(helperSource);
        const hash = createHash('sha256').update(source).update(process.arch).digest('hex').slice(0, 16);
        const cache = path.join(homedir(), 'Library', 'Caches', 'coach', 'native', hash);
        const modules = path.join(homedir(), 'Library', 'Caches', 'coach', 'native', 'modules', process.arch);
        const executable = path.join(cache, 'mac-canvas');
        await mkdir(modules, { recursive: true });
        await mkdir(path.join(cache, 'runtime'), { recursive: true });
        try { await access(executable); } catch {
          try {
            await run('/usr/bin/xcrun', ['swiftc', '-parse-as-library', '-module-cache-path', modules, helperSource, '-o', executable], { timeout: 120000, env: { ...process.env, TMPDIR: path.join(cache, 'runtime') } });
          } catch (error) {
            throw new Error(`无法准备 Mac 录制组件，请确认已安装 Apple Command Line Tools：${error.stderr || error.message}`);
          }
        }
        return executable;
      })().catch((error) => { compilation = undefined; throw error; });
    }
    return compilation;
  }

  async function locate(activate = false) {
    const executable = await helper();
    try {
      const { stdout } = await run(executable, [origin, ...(activate ? ['--activate'] : [])], { timeout: 15000 });
      const result = JSON.parse(stdout);
      if (result.error) throw new Error(result.error);
      if (![result.x, result.y, result.width, result.height].every(Number.isFinite)) throw new Error('无法读取画布的屏幕位置。');
      return result;
    } catch (error) {
      if (error.stdout) {
        const result = JSON.parse(error.stdout);
        if (result.error) throw new Error(result.error);
      }
      throw error;
    }
  }

  async function finish(code, stderr) {
    clearTimeout(timer);
    clearInterval(monitor);
    monitor = undefined;
    child = undefined;
    if (discard) {
      await rm(capture, { force: true });
      update({ status: state.error ? 'error' : 'idle', countdownEndsAt: undefined });
      return;
    }
    let size = 0;
    try { size = (await stat(capture)).size; } catch { /* No output was created. */ }
    if (size > 0) {
      try {
        update({ status: 'stopping' });
        const executable = await helper();
        const finalized = await run(executable, ['--finalize-video', capture, movie, '5'], { timeout: 3600000 });
        const { stdout } = await run(executable, ['--inspect-video', movie], { timeout: 15000 });
        const metadata = { ...JSON.parse(stdout), ...JSON.parse(finalized.stdout) };
        if (state.microphone && metadata.audioTracks < 1) throw new Error('录制文件没有麦克风音轨，请检查麦克风权限和默认输入设备。');
        update({ status: 'saved', fileName: path.basename(movie), filePath: movie, metadata, error: state.error || '' });
        await rm(capture, { force: true });
      } catch (error) {
        let message = error.message;
        if (error.stdout) {
          const result = JSON.parse(error.stdout);
          if (result.error) message = result.error;
        }
        update({ status: 'error', error: `无法保存录制文件：${message}` });
      }
    } else update({ status: 'error', error: state.error || `系统录制未生成视频，请检查屏幕录制和麦克风权限。${stderr ? ` ${stderr.trim()}` : `（退出状态 ${code}）`}` });
  }

  async function begin(id) {
    if (id !== operation || state.status !== 'countdown') return;
    update({ status: 'recording', startedAt: Date.now(), countdownEndsAt: undefined });
    try {
      const rect = await locate();
      if (id !== operation || state.status !== 'recording') return;
      if (!rect.visible) throw new Error('录制画布窗口未处于前台，请返回浏览器后重新录制。');
      if (['x', 'y', 'width', 'height'].some((key) => Math.abs(rect[key] - state.rect[key]) > 1)) {
        throw new Error('准备期间画布位置发生变化，请调整布局后重新录制。');
      }
      let checking = false;
      monitor = setInterval(async () => {
        if (checking || state.status !== 'recording') return;
        checking = true;
        try {
          const current = await locate();
          if (id !== operation || state.status !== 'recording') return;
          if (!current.visible || ['x', 'y', 'width', 'height'].some((key) => Math.abs(current[key] - rect[key]) > 1)) {
            update({ error: '画布的屏幕位置发生变化，录制已停止。调整布局后可以重新录制。' });
            await stop();
          }
        } catch (error) {
          if (id === operation && state.status === 'recording') {
            update({ error: `无法继续确认画布区域，录制已停止：${error.message}` });
            await stop();
          }
        } finally { checking = false; }
      }, 1000);
    } catch (error) {
      if (id === operation && state.status === 'recording') {
        discard = true;
        update({ error: error.message });
        await stop();
      }
    }
  }

  async function start({ pageOrigin, microphone = true }) {
    if (!state.available) throw new Error('Mac 系统录制功能需要 macOS。');
    if (state.directoryBusy) throw new Error('请完成录像目录设置后开始录制。');
    if (activeStatuses.has(state.status)) throw new Error('当前录制尚未结束。');
    origin = pageOrigin;
    const id = ++operation;
    discard = false;
    update({ status: 'preparing', error: '', fileName: undefined, filePath: undefined, metadata: undefined, startedAt: undefined, countdownEndsAt: undefined, microphone });
    try {
      const rect = await locate(true);
      if (id !== operation) return snapshot();
      if (!rect.visible) throw new Error('录制画布窗口未处于前台，请返回浏览器后重新录制。');
      await mkdir(directory, { recursive: true });
      if (id !== operation) return snapshot();
      const stamp = new Date().toISOString().replaceAll(':', '-').replace('T', '_').slice(0, 19);
      const name = `Coach_${stamp}_${randomUUID().slice(0, 6)}`;
      movie = path.join(directory, `${name}.mov`);
      capture = path.join(directory, `.${name}.capture.mov`);
      const region = [rect.x, rect.y, rect.width, rect.height].join(',');
      const args = ['-v', '-T', '0', '-R', region, ...(microphone ? ['-g'] : []), capture];
      let stderr = '';
      child = spawn('/usr/sbin/screencapture', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      child.stderr.on('data', (data) => { stderr = `${stderr}${data}`.slice(-4000); });
      completion = new Promise((resolve) => {
        child.once('error', (error) => { update({ error: error.message }); });
        child.once('close', async (code) => {
          try { await finish(code, stderr); }
          catch (error) { update({ status: 'error', error: `无法完成录制：${error.message}` }); }
          finally { resolve(); }
        });
      });
      update({ status: 'countdown', rect, countdownEndsAt: Date.now() + 5000 });
      timer = setTimeout(() => { void begin(id); }, 5000);
      return snapshot();
    } catch (error) {
      if (id === operation) update({ status: 'error', error: error.message });
      throw error;
    }
  }

  async function stop() {
    if (state.status === 'preparing' || state.status === 'countdown') {
      operation += 1;
      clearTimeout(timer);
      discard = true;
      if (!child) update({ status: 'idle', countdownEndsAt: undefined });
    }
    if (child && ['preparing', 'countdown', 'recording'].includes(state.status)) {
      update({ status: 'stopping' });
      clearTimeout(timer);
      clearInterval(monitor);
      const process = child;
      process.kill('SIGINT');
      const retry = setInterval(() => { if (child === process) process.kill('SIGINT'); }, 500);
      const terminate = setTimeout(() => { if (child === process) process.kill('SIGTERM'); }, 10000);
      try { await completion; } finally { clearInterval(retry); clearTimeout(terminate); }
    } else if (state.status === 'stopping') {
      await completion;
    }
    return snapshot();
  }

  async function openMovie() {
    if (!movie || state.status !== 'saved') throw new Error('当前还没有可打开的录制文件。');
    await run('/usr/bin/open', [movie]);
  }

  return { snapshot, start, stop, openMovie, configureDirectory, openDirectory, token };
}
