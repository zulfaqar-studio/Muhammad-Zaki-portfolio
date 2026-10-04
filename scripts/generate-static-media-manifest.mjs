import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const publicDir = path.join(ROOT, 'client', 'public');
const outputPath = path.join(publicDir, 'data', 'static-media.json');
const ignoredTopLevel = new Set(['data']);
const allowedExtensions = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico',
  '.mp4', '.webm', '.ogg', '.mov', '.m4v',
  '.pdf'
]);

function normalize(value) {
  return value.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
}

async function walk(dir, relative = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (relative === '' && ignoredTopLevel.has(entry.name.toLowerCase())) continue;
      result.push(...await walk(absolute, rel));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!allowedExtensions.has(ext)) continue;
    result.push({
      path: rel.replaceAll('\\', '/'),
      name: entry.name
    });
  }
  return result;
}

async function main() {
  const files = await walk(publicDir);
  const byPath = Object.fromEntries(files.map((file) => [normalize(file.path), file.path]));
  const byName = {};
  for (const file of files) {
    const key = normalize(file.name);
    if (!byName[key]) byName[key] = file.path;
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    files,
    byPath,
    byName
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Wrote ${files.length} static public-media record(s) to ${outputPath}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
