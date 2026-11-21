// Port of portmart's ui/intro/common.py: shared helpers for the intro animations.
// An animation is frame(buf, t, seed, cols, rows) drawing into a fresh Buffer, t in [0, 1]; at t == 1 it
// shows final(): the title's cartridge + wordmark. Pixels are two per cell (half blocks), keyed "x,y".
import { Buffer, C, CART, OMP, WM, cart, dim, grad, lerp, pymod, wordmark } from '../draw.js';
import { PyRandom } from '../pyrandom.js';

export const WORD = 'portmart';
export const WORD_COLOR = '#d6d9e0';
export const GOLD = C.gold;
export const N = 128;

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export function smooth(u) {
  u = clamp(u);
  return u * u * (3 - 2 * u);
}
export const tri = (v) => 1 - Math.abs(pymod(v, 2) - 1);

export function rng(seed, cols, rows, salt = 0) {
  const B = BigInt;
  return new PyRandom((B(seed) * 1000003n) ^ (B(cols) * 7919n) ^ (B(rows) * 104729n) ^ B(salt));
}

const lutMemo = new Map();
// [lut, dim lut, hot lut]: N colours each
export function luts(stops) {
  const key = stops.join();
  let hit = lutMemo.get(key);
  if (!hit) {
    const base = Array.from({ length: N }, (_, i) => grad(stops, i / (N - 1)));
    hit = [base, base.map((c) => dim(c, 0.55)), base.map((c) => lerp(c, '#ffffff', 0.55))];
    lutMemo.set(key, hit);
  }
  return hit;
}

export const lutAt = (lut, v) => lut[Math.trunc(clamp(v) * (N - 1) + 0.5)];

const fadeMemo = new Map();
// the gradient LUT cross-faded step/steps of the way to WORD_COLOR
export function fadeLut(stops, step, steps = 6) {
  const key = stops.join() + '|' + step;
  let hit = fadeMemo.get(key);
  if (!hit) {
    hit = luts(stops)[0].map((c) => lerp(c, WORD_COLOR, step / steps));
    fadeMemo.set(key, hit);
  }
  return hit;
}

// px: Map "x,y" -> colour, two pixel rows per cell (as draw.pixels)
export const pk = (x, y) => x + ',' + y;

export function blit(buf, px) {
  const acc = new Map();
  for (const [k, c] of px) {
    const i = k.indexOf(',');
    const x = +k.slice(0, i), y = +k.slice(i + 1);
    const ak = x + ',' + (y >> 1);
    let a = acc.get(ak);
    if (!a) acc.set(ak, (a = [x, y >> 1, null, null]));
    a[2 + (y & 1)] = c;
  }
  const { cols, rows, cells } = buf;
  for (const [x, cy, top, bot] of acc.values()) {
    if (x >= 0 && x < cols && cy >= 0 && cy < rows) {
      const cell = cells[cy][x];
      if (top !== null && bot !== null) cells[cy][x] = top === bot ? ['█', top, cell[2], false] : ['▀', top, bot, false];
      else if (top !== null) cells[cy][x] = ['▀', top, cell[2], false];
      else cells[cy][x] = ['▄', bot, cell[2], false];
    }
  }
}

// [cart_x, cart_y_px, word_x, word_y_px]: the title's cart at (lx, 4+oy), wordmark at (lx+20, 6+oy)
export function layout(cols, rows) {
  const oy = Math.floor((rows - 22) / 2), lx = Math.floor((cols - 56) / 2);
  return [lx, (4 + oy) * 2, lx + 20, (6 + oy) * 2];
}

export const CART_PX = [];         // [cx, cy, ch, s]; s = the base gradient coordinate draw.cart uses
CART.forEach((row, r) => {
  for (let c = 0; c < row.length; c++) if (row[c] !== '.') CART_PX.push([c, r, row[c], c / 15 * 0.6 + r / 13 * 0.4]);
});
const WIN_COL = Array.from({ length: 14 }, (_, r) => lerp('#2a2340', '#3a2f5c', r / 13));

// body(cx, cy, s, dim) colours '#' and 'r'; pins: 7 colours/null; gate(cx, cy, ch) false = detail not inked yet
export function cartPx(px, x0, y0, body, pins = null, gate = null) {
  if (pins === null) pins = new Array(7).fill(GOLD);
  for (const [cx, cy, ch, s] of CART_PX) {
    let c;
    if (ch === '#') c = body(cx, cy, s, false);
    else if (ch === 'r') c = body(cx, cy, s, true);
    else if (gate !== null && !gate(cx, cy, ch)) c = body(cx, cy, s, false);
    else if (ch === 'k') c = C.ink;
    else if (ch === 'w') c = WIN_COL[cy];
    else if (ch === 'p') c = C.cyan;
    else {
      c = pins[(cx - 1) >> 1];
      if (c === null) continue;
    }
    px.set(pk(x0 + cx, y0 + cy), c);
  }
}

export const LETTERS = [];         // per letter: [x offset, [[x, y], ...]]
let wx = 0;
for (const ch of WORD) {
  const g = WM[ch].split('|');
  const pts = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === '#') pts.push([x, y]);
  LETTERS.push([wx, pts]);
  wx += g[0].length + 1;
}
export const WORD_W = wx;          // 37 pixels

export function wordPx(px, x0, y0, letters, colorf) {
  for (const i of letters) {
    const [ox, pts] = LETTERS[i];
    for (const [x, y] of pts) px.set(pk(x0 + ox + x, y0 + y), colorf(i, ox + x, y));
  }
}

// the title's logo + wordmark with the cartridge gradient at `phase` (0 = the end frame of every intro)
export function title(b, phase = 0) {
  const [lx, cy, wx_, wy] = layout(b.cols, b.rows);
  cart(b, lx, cy >> 1, phase);
  wordmark(b, wx_, wy >> 1, WORD, () => WORD_COLOR);
}

const finals = new Map();
export function final(cols, rows) {
  const key = cols + 'x' + rows;
  let hit = finals.get(key);
  if (!hit) {
    hit = new Buffer(cols, rows, C.bg);
    title(hit, 0);
    finals.set(key, hit);
  }
  return hit;
}

// [[x, y, ch, fg, bg]] for every non-blank cell of final()
export function finalCells(cols, rows) {
  const out = [];
  final(cols, rows).cells.forEach((row, y) => row.forEach((c, x) => {
    if (c[0] !== ' ') out.push([x, y, c[0], c[1], c[2]]);
  }));
  return out;
}

export { OMP };
