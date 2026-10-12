import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sea from 'node:sea';

let directory;

export function runtimeDirectory() {
  if (directory) return directory;
  if (!sea.isSea()) {
    directory = fileURLToPath(new URL('..', import.meta.url));
    return directory;
  }
  const manifest = JSON.parse(sea.getAsset('coach-manifest', 'utf8'));
  const cache = process.platform === 'darwin'
    ? path.join(homedir(), 'Library', 'Caches', 'Coach')
    : path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache'), 'coach');
  directory = path.join(cache, 'runtime', manifest.id);
  const marker = path.join(directory, '.complete');
  if (!existsSync(marker)) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const name of manifest.files) {
      const destination = path.resolve(directory, name);
      if (!destination.startsWith(directory + path.sep)) throw new Error('Invalid bundled asset path.');
      mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      const temporary = `${destination}.${process.pid}`;
      writeFileSync(temporary, Buffer.from(sea.getAsset(name)), { mode: 0o600 });
      renameSync(temporary, destination);
    }
    writeFileSync(marker, manifest.id, { mode: 0o600 });
  }
  return directory;
}
