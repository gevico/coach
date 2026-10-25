import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const frames = '.artifacts/classroom-effects/frames';
await mkdir(frames, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(pathToFileURL(path.resolve('samples/assets/classroom-scene.html')).href);
  await page.waitForFunction(() => window.ready);
  await page.evaluate(() => window.coachScene.render(8));
  await page.screenshot({ path: 'samples/assets/classroom-scene-poster.png' });
  for (let frame = 0; frame < 120; frame++) {
    await page.evaluate(seconds => window.coachScene.render(seconds), frame / 15);
    await page.screenshot({ path: `${frames}/${String(frame).padStart(3, '0')}.png` });
  }
} finally { await browser.close(); }
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '15', '-i', `${frames}/%03d.png`, '-c:v', 'libvpx-vp9', '-crf', '35', '-b:v', '0', '-pix_fmt', 'yuv420p', 'samples/assets/classroom-scene.webm']);
console.log('Rendered the classroom scene poster and 8-second video.');
