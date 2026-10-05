#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, InvalidArgumentError } from 'commander';
import express from 'express';
import open from 'open';
import { createMacRecorder } from './mac-recording.mjs';
import { recordingRoutes } from './recording-routes.mjs';

const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
const distDirectory = path.join(packageDirectory, 'dist');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']);

function parsePort(value) {
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError('端口必须是 1 到 65535 之间的整数。');
  }
  return port;
}

async function loadFile(fileArgument) {
  const requestedPath = path.resolve(fileArgument);
  try {
    const filePath = await realpath(requestedPath);
    const info = await stat(filePath);
    if (!info.isFile()) {
      throw new Error(`Markdown 路径必须指向文件：${requestedPath}`);
    }
    await readFile(filePath, 'utf8');
    return filePath;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      throw new Error(`找不到 Markdown 文件：${requestedPath}`);
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw new Error(`无法读取 Markdown 文件：${requestedPath}`);
    }
    throw error;
  }
}

async function verifyBuild() {
  try {
    const index = await stat(path.join(distDirectory, 'index.html'));
    if (!index.isFile()) throw new Error('缺少网页入口文件。');
  } catch {
    throw new Error('缺少画布网页文件，请在项目目录运行 npm run build 后重试。');
  }
}

function isWithinDirectory(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function hasHiddenSegment(relativePath) {
  return relativePath.split(/[\\/]/).some((segment) => segment.startsWith('.'));
}

function createApp(filePath, notesPath, recorder) {
  const app = express();
  const assetDirectory = path.dirname(filePath);
  const documentId = createHash('sha256').update(filePath).digest('hex').slice(0, 16);
  app.disable('x-powered-by');

  app.get('/api/document', async (_request, response) => {
    const [source, notesSource] = await Promise.all([
      readFile(filePath, 'utf8'),
      notesPath ? readFile(notesPath, 'utf8') : undefined,
    ]);
    response.set('Cache-Control', 'no-store').json({
      source,
      assetBase: '/course-assets/',
      fileName: path.basename(filePath),
      documentId,
      ...(notesPath ? { notes: { source: notesSource, fileName: path.basename(notesPath) } } : {}),
    });
  });

  app.use('/api/recording', recordingRoutes(recorder));

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: '找不到请求的接口。' });
  });

  app.use('/course-assets', async (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.sendStatus(405);
      return;
    }

    let assetPath;
    try {
      const requestedPath = decodeURIComponent(request.path).replace(/^\/+/, '');
      const candidate = path.resolve(assetDirectory, requestedPath);
      if (!isWithinDirectory(assetDirectory, candidate) || hasHiddenSegment(requestedPath)
        || !imageExtensions.has(path.extname(candidate).toLowerCase())) {
        response.sendStatus(404);
        return;
      }

      assetPath = await realpath(candidate);
      const relativePath = path.relative(assetDirectory, assetPath);
      if (!isWithinDirectory(assetDirectory, assetPath) || hasHiddenSegment(relativePath)
        || !imageExtensions.has(path.extname(assetPath).toLowerCase())
        || !(await stat(assetPath)).isFile()) {
        response.sendStatus(404);
        return;
      }
    } catch (error) {
      if (error instanceof URIError || ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EINVAL'].includes(error.code)) {
        response.sendStatus(404);
        return;
      }
      next(error);
      return;
    }

    response.sendFile(path.relative(assetDirectory, assetPath), {
      root: assetDirectory,
      dotfiles: 'deny',
      headers: { 'Cache-Control': 'no-cache' },
    }, (error) => {
      if (error) next(error);
    });
  });

  app.use(express.static(distDirectory, { dotfiles: 'deny' }));
  app.get('/{*page}', (_request, response) => {
    response.sendFile('index.html', { root: distDirectory });
  });
  app.use((error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    response.status(error.status === 404 ? 404 : 500).json({ error: '无法读取请求的文件，请检查文件是否存在及读取权限。' });
  });
  return app;
}

async function listen(app, preferredPort, allowNextPort) {
  let port = preferredPort;
  while (port <= 65535) {
    const server = createServer(app);
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.removeListener('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.removeListener('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, '127.0.0.1');
      });
      return { server, port };
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      if (!allowNextPort) {
        throw new Error(`端口 ${port} 已被占用，请使用 --port 指定其他端口。`);
      }
      port += 1;
    }
  }
  throw new Error('找不到可用端口，请使用 --port 指定其他端口。');
}

async function start(fileArgument, options, command) {
  if ([options.zen, options.presenter, options.explain].filter(Boolean).length > 1) throw new Error('请选择禅模式、演讲模式或解释模式中的一种。');
  const filePath = await loadFile(fileArgument);
  const notesPath = options.notes ? await loadFile(options.notes) : undefined;
  await verifyBuild();
  const recorder = await createMacRecorder(options.recordDir ? { directory: options.recordDir } : {});
  const { server, port } = await listen(createApp(filePath, notesPath, recorder), options.port, command.getOptionValueSource('port') !== 'cli');
  const url = `http://127.0.0.1:${port}/${options.zen ? '?zen=1' : options.presenter ? '?presenter=1' : options.explain ? '?explain=1' : ''}`;

  const stop = async () => {
    await recorder.stop();
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  server.on('error', (error) => {
    console.error(`coach: ${error.message}`);
    process.exitCode = 1;
    server.close();
    server.closeAllConnections();
  });

  console.log(`Markdown：${filePath}`);
  if (notesPath) console.log(`口播稿：${notesPath}`);
  console.log(`画布地址：${url}`);
  console.log(options.explain ? '使用左右方向键选择内容并阅读解析。按 Ctrl+C 停止服务。' : '使用左右方向键逐步展示。按 Ctrl+C 停止服务。');

  if (options.open) {
    try {
      await open(url);
    } catch {
      console.error(`无法自动打开浏览器，请打开画布地址：${url}`);
    }
  }
}

const program = new Command();
program
  .name('coach')
  .description('读取本地 Markdown 文件，在浏览器中展示可缩放的分栏画布。')
  .argument('<file.md>', 'Markdown 文件路径，支持中文和空格')
  .option('-p, --port <number>', '指定本地服务端口；默认端口占用时自动选择可用端口', parsePort, 4173)
  .option('--no-open', '启动服务后保留画布地址，手动打开浏览器')
  .option('--zen', '打开纯画布展示模式')
  .option('--presenter', '打开演讲模式，显示 16:9 画布和口播注释')
  .option('--explain', '打开解释模式，手动选择板书并阅读对应解析')
  .option('--notes <file.md>', '指定已有的独立 Markdown 口播稿')
  .option('--record-dir <directory>', '指定 Mac 录制视频保存目录，默认 ~/Movies/Coach')
  .helpOption('-h, --help', '显示使用说明')
  .addHelpText('after', '\n示例：\n  coach ./lesson.md\n  coach ./lesson.md --presenter\n  coach ./design.md --explain\n  coach "./演示资料/演示文稿.md" --zen\n  coach ./lesson.md --notes ./notes.md --presenter\n  coach ./lesson.md --port 4300 --no-open\n')
  .action(start);

try {
  await program.parseAsync();
} catch (error) {
  console.error(`coach: ${error.message}`);
  process.exitCode = 1;
}
