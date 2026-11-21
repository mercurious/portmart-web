// Stages the site in _site/ for `wrangler pages deploy`: the page, its modules, fonts, placeholder media,
// _headers, _redirects, a favicon.svg drawn from the cartridge logo (phase 0, the colours the intros settle
// on), and sw.js with this build's version and file list.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { Buffer, C, cart } from '../src/draw.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, '_site');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of ['index.html', 'style.css', '_headers', '_redirects']) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const d of ['src', 'fonts', 'placeholder']) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });

// cartridge: 16 x 14 pixels = 16 x 7 half-block cells
const b = new Buffer(16, 7);
cart(b, 0, 0, 0);
const rects = [];
const rect = (x, y, h, fill) => rects.push(`<rect x="${x}" y="${y + 1}" width="1" height="${h}" fill="${fill}"/>`);
b.cells.forEach((row, cy) => row.forEach(([g, fg, bg], x) => {
  if (g === '█') rect(x, 2 * cy, 2, fg);
  else if (g === '▀') {
    rect(x, 2 * cy, 1, fg);
    if (bg !== C.bg) rect(x, 2 * cy + 1, 1, bg);
  } else if (g === '▄') rect(x, 2 * cy + 1, 1, fg);
}));
fs.writeFileSync(path.join(out, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects.join('')}</svg>\n`);

// the service worker precaches every served file; its version is a hash of them, so a new build replaces it
const files = fs.readdirSync(out, { recursive: true })
  .filter((f) => fs.statSync(path.join(out, f)).isFile() && !['_headers', '_redirects'].includes(f))
  .map((f) => f.split(path.sep).join('/')).sort();
const hash = crypto.createHash('sha256');
for (const f of files) hash.update(f).update(fs.readFileSync(path.join(out, f)));
const version = hash.digest('hex').slice(0, 12);
const shell = ['/', ...files.map((f) => `/${f}`)];
fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync(path.join(root, 'sw.js'), 'utf8')
  .replace("'__VERSION__'", JSON.stringify(version)).replace('__SHELL__', JSON.stringify(shell)));

console.log(`_site: ${files.length + 1} files, version ${version}`);
