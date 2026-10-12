import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = path.join(root, '.artifacts/binary-check');
await mkdir(directory, { recursive: true });
const executable = path.join(directory, 'coach');
await copyFile(path.join(root, 'build/coach'), executable);
assert.match(execFileSync(executable, ['--help'], { encoding: 'utf8' }), /--host/);
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '0.0.0.0', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const file = path.join(root, 'samples/diagrams.md');
const child = spawn(executable, [file, '--host', '0.0.0.0', '--port', String(port), '--presenter', '--no-open'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (data) => { output += data; });
child.stderr.on('data', (data) => { output += data; });
const exited = new Promise((resolve) => child.once('exit', resolve));
try {
  let response;
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(output);
    try { response = await fetch(`${base}/api/document`); break; } catch { await setTimeout(100); }
  }
  assert.ok(response?.ok, output);
  assert.equal((await response.json()).source, await readFile(file, 'utf8'));
  const index = await fetch(base);
  assert.equal(index.status, 200);
  const html = await index.text();
  assert.ok(html.includes('/assets/'));
  const manifest = JSON.parse(await readFile(path.join(root, 'build/manifest.json'), 'utf8'));
  for (const name of manifest.files) {
    assert.ok(name === 'dist/index.html' || name === 'bin/mac-canvas.swift' || name.startsWith('dist/assets/'));
    if (name.startsWith('dist/assets/')) {
      const asset = await fetch(`${base}/${name.slice(5)}`);
      assert.equal(asset.status, 200, name);
      assert.deepEqual(Buffer.from(await asset.arrayBuffer()), await readFile(path.join(root, name)));
    }
  }
  for (const name of ['board-flow.svg', 'board-flow.gif']) {
    const asset = await fetch(`${base}/course-assets/assets/${name}`);
    assert.equal(asset.status, 200);
    assert.deepEqual(Buffer.from(await asset.arrayBuffer()), await readFile(path.join(root, 'samples/assets', name)));
  }
  const address = Object.values(networkInterfaces()).flat().find((entry) => entry.family === 'IPv4' && !entry.internal)?.address;
  if (address) assert.equal((await fetch(`http://${address}:${port}/api/document`)).status, 200);
  if (process.env.COACH_BROWSER_PATH) {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ executablePath: process.env.COACH_BROWSER_PATH });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/?presenter=1`);
      await page.getByText('图示与动图', { exact: true }).first().waitFor();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.locator('img[src*="board-flow.svg"]').first().waitFor({ state: 'attached' });
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.locator('img[src*="board-flow.gif"]').first().waitFor({ state: 'attached' });
      await page.waitForFunction(() => [...document.images].filter((image) => image.src.includes('board-flow')).every((image) => image.complete && image.naturalWidth > 0));
      await page.evaluate(() => document.fonts.ready);
      await setTimeout(2000);
      await page.screenshot({ path: path.join(directory, 'presenter.png') });
      assert.deepEqual(errors, []);
      console.log('Verified presenter navigation and SVG/GIF rendering in Chromium.');
    } finally { await browser.close(); }
  }
  console.log('Verified standalone binary, embedded web assets, Markdown, SVG/GIF and network access.');
} finally {
  child.kill('SIGTERM');
  await exited;
}
