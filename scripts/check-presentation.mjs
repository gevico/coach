import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const url = process.env.COACH_TEST_URL || 'http://127.0.0.1:4306/?presenter=1';
const out = '.artifacts/classroom-effects/check';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('.canvas-board[data-ready="true"]').waitFor();
  assert.equal(await page.locator('.canvas-board').getAttribute('data-theme'), 'studio');
  await page.getByRole('button', { name: '全部显示', exact: true }).click();
  const themes = [
    ['默认板书', 'paper', 'write', 'rgb(252, 252, 252)'],
    ['现代排版', 'editorial', 'slide', 'rgb(244, 248, 249)'],
    ['暗色光点', 'particles', 'cinematic', 'rgb(3, 3, 5)'],
  ];
  for (const [label, theme, motion, background] of themes) {
    await page.getByRole('button', { name: '课堂外观与动效', exact: true }).click();
    await page.getByRole('button', { name: `选择主题：${label}`, exact: true }).click();
    assert.equal(await page.locator('.canvas-board').getAttribute('data-theme'), theme);
    assert.equal(await page.getByLabel('入场效果').inputValue(), motion);
    assert.equal(await page.locator('.canvas-board').evaluate(node => getComputedStyle(node).backgroundColor), background);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('coach-presentation-v1')).theme), theme);
    await page.getByRole('button', { name: '关闭外观设置' }).click();
    await page.locator('.diagram-content svg').waitFor();
    assert.ok((await page.locator('.diagram-content .nodes').textContent()).includes('提出问题'));
    for (const plugin of await page.locator('.board-plugin').all()) {
      assert.deepEqual(await plugin.evaluate(node => {
        const style = getComputedStyle(node);
        return [style.borderTopWidth, style.borderBottomWidth, style.boxShadow, style.backgroundColor];
      }), ['0px', '0px', 'none', 'rgba(0, 0, 0, 0)']);
    }
    await page.screenshot({ path: `${out}/theme-${theme}.png` });
  }
  assert.equal(await page.locator('.canvas-board').evaluate(node => getComputedStyle(node, '::before').animationName), 'board-light-drift');
  await page.getByRole('button', { name: '暂停动效', exact: true }).click();
  assert.equal(await page.locator('.canvas-board').evaluate(node => getComputedStyle(node, '::before').animationPlayState), 'paused');
  await page.getByRole('button', { name: '继续动效', exact: true }).click();
  await page.getByRole('button', { name: '从头展示', exact: true }).click();
  await page.getByRole('button', { name: '课堂外观与动效', exact: true }).click();
  await page.getByRole('button', { name: /深色演示/ }).click();
  await page.getByLabel('播放速度').selectOption('3');
  await page.getByLabel('进入视频步骤时自动播放').uncheck();
  assert.equal(await page.locator('.canvas-board').getAttribute('data-theme'), 'night');
  await page.getByRole('button', { name: '关闭外观设置' }).click();
  for (let index = 0; index < 6; index++) await page.keyboard.press('ArrowRight');
  await page.locator('.diagram-content svg').waitFor();
  assert.ok((await page.locator('.diagram-content .nodes').textContent()).includes('提出问题'));
  assert.equal(await page.locator('.diagram-plugin [data-player-controls], .scene-plugin [data-player-controls]').count(), 0);
  await page.waitForFunction(() => parseFloat(document.querySelector('.flowchart-link').style.strokeDashoffset) === 0);
  await page.waitForFunction(() => parseFloat(document.querySelector('.flowchart-link').style.strokeDashoffset) > 5);
  await page.getByRole('button', { name: '暂停动效', exact: true }).click();
  const graphFrame = await page.locator('.diagram-content').innerHTML();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.diagram-content').innerHTML(), graphFrame);
  await page.getByRole('button', { name: '继续动效', exact: true }).click();
  for (let index = 0; index < 3; index++) await page.keyboard.press('ArrowRight');
  await page.locator('.scene-plugin[data-scene-ready="true"]').waitFor({ timeout: 35000 });
  const scene = page.frameLocator('iframe[title="讲解的节奏"]');
  await scene.locator('#stage').waitFor();
  const sceneTime = () => scene.locator('.caption').evaluate(node => node.getAnimations()[0].currentTime);
  const looped = await scene.locator('.caption').evaluate(node => new Promise(resolve => {
    const started = performance.now();
    let nearEnd = false;
    const observe = () => {
      const time = node.getAnimations()[0].currentTime;
      if (time > 10000) nearEnd = true;
      if (nearEnd && time < 1000) return resolve(true);
      if (performance.now() - started > 12000) return resolve(false);
      requestAnimationFrame(observe);
    };
    observe();
  }));
  assert.equal(looped, true);
  await page.getByRole('button', { name: '暂停动效', exact: true }).click();
  await page.waitForTimeout(100);
  const pausedScene = await sceneTime();
  await page.waitForTimeout(300);
  assert.equal(await sceneTime(), pausedScene);
  await page.getByRole('button', { name: '继续动效', exact: true }).click();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);
  const hiddenScene = await sceneTime();
  await page.waitForTimeout(300);
  assert.equal(await sceneTime(), hiddenScene);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  assert.notEqual(await sceneTime(), hiddenScene);
  const isolated = await scene.locator('body').evaluate(() => {
    try { return !!parent.document.body; } catch { return false; }
  });
  assert.equal(isolated, false);
  await page.keyboard.press('ArrowRight');
  const visibleScene = await sceneTime();
  await page.waitForTimeout(300);
  assert.notEqual(await sceneTime(), visibleScene);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('.board-plugin video')?.readyState >= 2, undefined, { timeout: 30000 });
  assert.equal(await page.locator('video').evaluate(video => video.paused), true);
  assert.ok(await page.locator('.video-plugin').evaluate(node => Math.abs(node.getBoundingClientRect().height - node.querySelector('video').getBoundingClientRect().height) < 1));
  assert.ok(await page.locator('.scene-plugin').evaluate(node => Math.abs(node.getBoundingClientRect().height - node.querySelector('.scene-viewport').getBoundingClientRect().height) < 1));
  await page.getByRole('slider', { name: '进度：课堂场景的视频版本', exact: true }).fill('6');
  await page.waitForTimeout(500);
  assert.ok(await page.locator('video').evaluate(video => Math.abs(video.currentTime - 6) < .2));
  await page.screenshot({ path: `${out}/video.png` });
  await page.getByRole('button', { name: '放大演示：课堂场景的视频版本', exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains('video-plugin'));
  await page.screenshot({ path: `${out}/video-fullscreen.png` });
  await page.getByRole('button', { name: '退出放大：课堂场景的视频版本', exact: true }).click();
  await page.getByRole('button', { name: '重播：课堂场景的视频版本', exact: true }).click();
  await page.waitForTimeout(300);
  assert.ok(await page.locator('video').evaluate(video => video.currentTime > 0 && !video.paused));
  await page.keyboard.press('ArrowLeft');
  const stoppedVideo = await page.locator('.video-plugin input[type="range"]').inputValue();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.video-plugin input[type="range"]').inputValue(), stoppedVideo);
  assert.equal(await page.locator('video').evaluate(video => video.paused), true);
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: '全部显示', exact: true }).click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.math-plugin .katex').count(), 1);
  await page.screenshot({ path: `${out}/overview.png` });
  await page.getByRole('button', { name: '导出画布', exact: true }).click();
  const download = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  await (await download).saveAs(`${out}/export.svg`);
  const exported = await readFile(`${out}/export.svg`, 'utf8');
  assert.ok(!exported.includes('<iframe'));
  assert.ok(exported.includes('data:image/png'));
  assert.ok(exported.includes('16, 25, 35') || exported.includes('#101923'));
  await page.getByRole('button', { name: '课堂外观与动效', exact: true }).click();
  await page.getByRole('button', { name: '选择主题：暗色光点', exact: true }).click();
  await page.getByRole('button', { name: '关闭外观设置' }).click();
  await page.locator('.diagram-content svg').waitFor();
  await page.getByRole('button', { name: '导出画布', exact: true }).click();
  const themeDownload = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: 'SVG', exact: true }).click();
  await (await themeDownload).saveAs(`${out}/export-particles.svg`);
  const themedExport = await readFile(`${out}/export-particles.svg`, 'utf8');
  assert.ok(themedExport.includes('3, 3, 5') || themedExport.includes('#030305'));
  assert.ok(themedExport.includes('data-theme="particles"'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.canvas-board').evaluate(node => getComputedStyle(node, '::before').animationName), 'none');
  await page.getByRole('button', { name: '从头展示', exact: true }).click();
  for (let index = 0; index < 9; index++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  await page.locator('.scene-plugin[data-scene-ready="true"]').waitFor();
  assert.equal(await sceneTime(), 0);
  assert.equal(await page.locator('.diagram-content .flowchart-link').first().evaluate(node => parseFloat(node.style.strokeDashoffset)), 0);
  assert.ok(await page.locator('.scene-viewport > img').isVisible());
  const asset = await page.request.get(new URL('/course-assets/assets/classroom-scene.html', url).href);
  assert.equal(asset.status(), 200);
  assert.equal(asset.headers()['access-control-allow-origin'], '*');
  assert.ok(asset.headers()['content-security-policy'].includes('sandbox allow-scripts'));
  assert.equal((await page.request.get(new URL('/course-assets/..%2fpackage.json', url).href)).status(), 404);
  await writeFile(`${out}/report.json`, JSON.stringify({ themes: themes.map(([label]) => label), themeMotion: true, themeSaved: true, borderlessMedia: true, overlayVideoControls: true, ambientPause: true, diagramLoop: true, math: true, sceneLoop: true, sceneIsolation: true, scenePauseResume: true, hiddenPaused: true, visibleLooping: true, videoSeek: true, videoFullscreen: true, inactiveVideoPaused: true, staticExport: true, reducedMotion: true, errors }, null, 2));
  assert.deepEqual(errors, []);
  console.log('Verified themes, borderless looping animations, compact video playback, reduced motion and SVG export.');
} catch (error) {
  console.error(error);
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({ path: `${out}/failure.png` });
    await writeFile(`${out}/failure.txt`, await page.locator('body').innerText());
  }
  process.exitCode = 1;
} finally { await browser.close(); }
