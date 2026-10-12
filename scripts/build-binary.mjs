import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'build');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 25 || (major === 25 && minor < 5)) throw new Error('Run make binary to use the dedicated Node runtime with --build-sea support.');
await mkdir(output, { recursive: true });
const assets = { 'dist/index.html': path.join(root, 'dist/index.html'), 'bin/mac-canvas.swift': path.join(root, 'bin/mac-canvas.swift') };
async function collect(directory) {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await collect(name);
    else if (entry.isFile()) assets[name] = path.join(root, name);
  }
}
await collect('dist/assets');
const hash = createHash('sha256');
for (const name of Object.keys(assets).sort()) hash.update(name).update(await readFile(assets[name]));
const manifest = path.join(output, 'manifest.json');
await writeFile(manifest, JSON.stringify({ id: hash.digest('hex'), files: Object.keys(assets) }));
assets['coach-manifest'] = manifest;
await build({
  entryPoints: [path.join(root, 'bin/coach.mjs')],
  outfile: path.join(output, 'coach.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node25.5',
  banner: { js: 'const coachModuleUrl = require("node:url").pathToFileURL(__filename).href;' },
  define: { 'import.meta.url': 'coachModuleUrl' },
});
const executable = path.join(output, 'coach');
const config = path.join(output, 'sea-config.json');
await writeFile(config, JSON.stringify({ main: path.join(output, 'coach.cjs'), output: executable, disableExperimentalSEAWarning: true, assets }));
execFileSync(process.execPath, ['--build-sea', config], { stdio: 'inherit' });
if (process.platform === 'darwin') execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', executable], { stdio: 'inherit' });
console.log(`Executable: ${executable}`);
