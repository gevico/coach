import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { chromium } from '@playwright/test';

const cli = new Command().argument('<diagram.mmd>')
  .requiredOption('--svg <file>', 'Rendered SVG')
  .option('--gif <file>', 'Node-highlight teaching GIF')
  .option('--frames <directory>', 'Intermediate frames', '.artifacts/course-generation/media').parse();
const options = cli.opts();
const source = await readFile(cli.args[0], 'utf8');
const require = createRequire(import.meta.url);
const mermaidScript = require.resolve('mermaid/dist/mermaid.min.js');
await mkdir(path.dirname(path.resolve(options.svg)), { recursive: true });
if (options.gif) {
  const version = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (version.error || version.status !== 0) throw new Error('FFmpeg is required for GIF output.');
}
const browser = await chromium.launch({ executablePath: process.env.COACH_BROWSER_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  await page.setContent('<html><body style="margin:0;background:#fcfcfc"><div id="diagram" style="display:inline-block;padding:16px"></div></body></html>');
  await page.addScriptTag({ path: mermaidScript });
  await page.evaluate(async (text) => {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
    const result = await window.mermaid.render('course-diagram', text);
    document.querySelector('#diagram').innerHTML = result.svg;
  }, source);
  await page.evaluate(() => document.fonts.ready);
  await writeFile(options.svg, await page.locator('#diagram svg').evaluate((node) => new XMLSerializer().serializeToString(node)));
  if (options.gif) {
    await mkdir(path.dirname(path.resolve(options.gif)), { recursive: true });
    const frames = path.resolve(options.frames);
    await mkdir(frames, { recursive: true });
    const nodes = page.locator('#diagram .node');
    const count = await nodes.count();
    if (count < 2) throw new Error('Node-highlight GIF requires at least two Mermaid nodes.');
    await page.addStyleTag({ content: '#diagram .course-active rect,#diagram .course-active polygon,#diagram .course-active path{fill:#fef3c7!important;stroke:#c2410c!important;stroke-width:3px!important}' });
    for (let index = 0; index < count; index++) {
      await nodes.evaluateAll((items, active) => items.forEach((node, number) => node.classList.toggle('course-active', number === active)), index);
      for (let frame = 0; frame < 6; frame++) {
        const filename = `frame-${String(index * 6 + frame).padStart(4, '0')}.png`;
        await page.locator('#diagram').screenshot({ path: path.join(frames, filename) });
      }
    }
    const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '6', '-i', path.join(frames, 'frame-%04d.png'), '-frames:v', String(count * 6), '-filter_complex', '[0:v]split[a][b];[a]palettegen=stats_mode=single[p];[b][p]paletteuse=new=1:dither=bayer:bayer_scale=5', '-fps_mode', 'passthrough', '-loop', '0', options.gif], { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  }
  console.log(JSON.stringify({ svg: options.svg, gif: options.gif || null, purpose: 'teaching illustration' }));
} finally {
  await browser.close();
}
