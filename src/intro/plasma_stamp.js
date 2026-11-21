// Port of portmart's ui/intro/plasma_stamp.py. A sine-sum plasma seen only through the portmart mask,
// stamped in by a dithered reveal with a soft halo, settling into the clean gradient; then the
// wordmark cools to its title ink and the cartridge's window and pins ink in.
import {
  CART_PX, LETTERS, OMP, WORD_W, blit, cartPx, clamp, fadeLut, layout, lutAt, luts, pk, rng, smooth, tri,
} from './common.js';

export const NAME = 'plasma_stamp';
export const DURATION = 1.2;

const REVEAL_T = 0.30;
const SETTLE = [0.35, 0.80];
const COOL = [0.80, 0.97];
const DETAIL = [0.55, 0.75];
const HALO_T = 0.55;
const DETAIL_AT = { k: (cx) => 0.30 * cx / 15, w: (cx) => 0.35 + 0.25 * cx / 15, p: () => 0.70, g: (cx) => 0.78 + 0.22 * ((cx - 1) >> 1) / 6 };

const cache = new Map();

function setup(seed, cols, rows) {
  const key = seed + ':' + cols + 'x' + rows;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rng(seed, cols, rows);
  const [lx, cy, wx, wy] = layout(cols, rows);
  const mode = seed % 4;
  const x0 = lx, span = wx + WORD_W - lx;

  const thr = (x) => {                     // when the stamp reaches this column, with some noise
    const u = (x - x0) / span;
    const opts = [u, 1 - u, Math.abs(u - 0.5) * 2, r.random()];   // Python draws the 4th always
    return clamp(0.65 * opts[mode] + 0.35 * r.random()) * 0.95;
  };

  const cart = new Map(), detail = new Map();
  for (const [cx, cy_, ch] of CART_PX) {
    const k = pk(lx + cx, cy + cy_);
    cart.set(k, thr(lx + cx));
    detail.set(k, DETAIL_AT[ch] ? DETAIL_AT[ch](cx) : 0);
  }
  const word = [];                         // [x, y, threshold, gradient position]
  for (const [ox, pts] of LETTERS) {
    for (const [x, y] of pts) word.push([wx + ox + x, wy + y, thr(wx + ox + x), (ox + x) / (WORD_W - 1)]);
  }
  const occ = new Set();
  for (const k of cart.keys()) {
    const [x, y] = k.split(',').map(Number);
    occ.add(pk(x, y >> 1));
  }
  for (const [x, y] of word) occ.add(pk(x, y >> 1));
  const ring = new Map();
  for (const k of occ) {
    const [x, y] = k.split(',').map(Number);
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        const nx = x + dx, ny = y + dy, nk = pk(nx, ny);
        if (!occ.has(nk) && nx >= 0 && nx < cols && ny >= 0 && ny < rows) ring.set(nk, [nx, ny]);
      }
    }
  }
  const sorted = [...ring.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const halo = sorted.map(([x, y]) => {
    const h = r.random();
    return [x, y, h, thr(x)];
  });
  const hue = r.random() * 2;
  const k = [r.uniform(0.30, 0.55), r.uniform(0.55, 1.0), r.uniform(0.25, 0.5)];
  const sgn = seed % 2 ? 1 : -1;
  const w = [r.uniform(5, 9) * sgn, r.uniform(4, 8), r.uniform(6, 10)];
  const out = { lx, cy, cart, detail, word, halo, hue, k, w };
  cache.set(key, out);
  return out;
}

export function frame(buf, t, seed, cols, rows) {
  const S = setup(seed, cols, rows);
  const { lx, cy, hue } = S;
  const [omp, ompDim] = luts(OMP);
  const settle = smooth((t - SETTLE[0]) / (SETTLE[1] - SETTLE[0]));
  const cool = Math.trunc(smooth((t - COOL[0]) / (COOL[1] - COOL[0])) * 6 + 0.5);
  const reveal = smooth(t / REVEAL_T) * 1.05;
  const te = t * (1 - 0.5 * settle);
  const [ka, kb, kc] = S.k, [wa, wb, wc] = S.w;
  const sx = new Float64Array(cols), sy = new Float64Array(2 * rows), sd = new Float64Array(cols + 2 * rows);
  for (let x = 0; x < cols; x++) sx[x] = Math.sin(x * ka + te * wa);
  for (let y = 0; y < 2 * rows; y++) sy[y] = Math.sin(y * kb + te * wb);
  for (let i = 0; i < cols + 2 * rows; i++) sd[i] = Math.sin(i * kc + te * wc);
  const wordLut = cool ? fadeLut(OMP, cool) : omp;
  const px = new Map();

  const body = (cx, cy_, s, dim) => {
    const x = lx + cx, y = cy + cy_;
    const v = (1 - settle) * ((sx[x] + sy[y] + sd[x + y]) * 0.37 + 0.5 + hue) + settle * s;
    return lutAt(dim ? ompDim : omp, tri(v));
  };
  const [d0, d1] = DETAIL, det = S.detail;
  cartPx(px, lx, cy, body, null, (cx, cy_) => t >= d0 + (d1 - d0) * det.get(pk(lx + cx, cy + cy_)));
  for (const [k, th] of S.cart) if (th >= reveal) px.delete(k);   // the stamp hasn't reached these yet
  for (const [x, y, th, g] of S.word) {
    if (th < reveal) {
      const v = (1 - settle) * ((sx[x] + sy[y] + sd[x + y]) * 0.37 + 0.5 + hue) + settle * g;
      px.set(pk(x, y), lutAt(wordLut, tri(v)));
    }
  }
  blit(buf, px);
  if (t > 0.02 && t < HALO_T) {                    // soft halo around the mask, dissolving
    const fade = t / HALO_T;
    for (const [x, y, h, th] of S.halo) {
      if (h > fade && th < reveal + 0.15) {
        const v = (sx[x] + sy[2 * y] + sd[x + 2 * y]) * 0.37 + 0.5 + hue;
        buf.put(x, y, h > fade + 0.25 ? '░' : '▒', lutAt(ompDim, tri(v)));
      }
    }
  }
}
