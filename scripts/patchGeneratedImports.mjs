import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : entry.name.endsWith('.ts') ? [path] : [];
  }))).flat();
}

for (const path of await files('src/generated')) {
  const source = await readFile(path, 'utf8');
  const patched = source.replace(/(from ['"]\.{1,2}\/[A-Za-z0-9_/-]+)(['"])/g, '$1.js$2');
  if (patched !== source) await writeFile(path, patched);
}
