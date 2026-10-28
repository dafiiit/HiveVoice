// Puts the draw.io editor under public/drawio/ (served as /drawio), so diagrams work without diagrams.net and, once
// opened, offline (the service worker keeps /drawio/). Runs before `next build`; a fixed release, checked by its SHA-256.
// The files are not in Git (about 100 MB): they are fetched once and kept in node_modules/.cache.
// DRAWIO_SELFHOST=0 skips it; if the download fails, the build goes on and the editor loads from embed.diagrams.net.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

const VERSION = '32.4.1';
const SHA256 = 'b83663313ccdecef6581476a7eaa96750bccf1bfdc3768981eb5d95e94be7820';
const URL = `https://github.com/jgraph/drawio/releases/download/v${VERSION}/draw.war`;
const out = path.join(process.cwd(), 'public', 'drawio');
const cache = path.join(process.cwd(), 'node_modules', '.cache', 'drawio', `draw-${VERSION}.war`);
// Server parts (Java) and the unminified sources (only for ?dev=1) are not needed in the browser.
const SKIP = [/^WEB-INF\//, /^META-INF\//, /^js\/diagramly\//, /^js\/grapheditor\//];

if (process.env.DRAWIO_SELFHOST === '0') { console.log('drawio: skipped (DRAWIO_SELFHOST=0)'); process.exit(0); }
const stamp = path.join(out, '.version');
if (existsSync(stamp) && (await readFile(stamp, 'utf8')).trim() === VERSION) { console.log(`drawio: ${VERSION} present`); process.exit(0); }

try {
  let war = existsSync(cache) ? await readFile(cache) : null;
  if (!war || sha(war) !== SHA256) {
    console.log(`drawio: downloading ${VERSION}`);
    const res = await fetch(URL, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    war = Buffer.from(await res.arrayBuffer());
    if (sha(war) !== SHA256) throw new Error('checksum mismatch');
    await mkdir(path.dirname(cache), { recursive: true });
    await writeFile(cache, war);
  }
  await rm(out, { recursive: true, force: true });
  let n = 0;
  for (const entry of unzip(war)) {
    if (entry.name.endsWith('/') || SKIP.some((re) => re.test(entry.name))) continue;
    const file = path.join(out, entry.name);
    if (!file.startsWith(out + path.sep)) continue; // no paths out of the folder
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, entry.data());
    n++;
  }
  await writeFile(stamp, VERSION + '\n');
  console.log(`drawio: ${VERSION}, ${n} files in public/drawio`);
} catch (e) {
  console.warn(`drawio: not available (${e.message}); the editor loads from embed.diagrams.net`);
}

function sha(buf) { return createHash('sha256').update(buf).digest('hex'); }

/** The entries of a zip file (stored or deflated), read from its central directory. */
function* unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    yield { name, data: () => (method === 0 ? raw : method === 8 ? inflateRawSync(raw) : (() => { throw new Error(`zip method ${method}`); })()) };
  }
}
