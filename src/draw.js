// Port of the parts of portmart's ui/draw.py and ui/term.py the intros use. Colours are "#rrggbb"
// strings and arithmetic follows Python (round half to even, floored modulo) so frames match the app.

export const C = {
  bg: '#0b0d12', purple: '#9362f4', cyan: '#00dbe4', pink: '#ff4fd8', gold: '#d4c090', ink: '#05060a',
};
export const OMP = ['#ff4fd8', '#9362f4', '#00dbe4'];
export const SUNSET = ['#ffb000', '#ff4fd8', '#9362f4'];
export const DEFAULT_FG = '#e8eaf0';

// Python round(): half to even
export function pyround(x) {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

// Python float %: the result takes the divisor's sign
export function pymod(a, b) {
  let m = a % b;
  if (m !== 0 && (m < 0) !== (b < 0)) m += b;
  return m;
}

const hxMemo = new Map();
export function hx(c) {
  let hit = hxMemo.get(c);
  if (hit === undefined) {
    const n = parseInt(c.slice(1), 16);
    hit = [n >> 16, (n >> 8) & 255, n & 255];
    hxMemo.set(c, hit);
  }
  return hit;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
const ch8 = (v) => HEX[v < 0 ? 0 : v > 255 ? 255 : v];

export function lerp(a, b, t) {
  const [r0, g0, b0] = hx(a), [r1, g1, b1] = hx(b);
  return '#' + ch8(pyround(r0 + (r1 - r0) * t)) + ch8(pyround(g0 + (g1 - g0) * t)) + ch8(pyround(b0 + (b1 - b0) * t));
}

export function grad(stops, t) {
  t = Math.max(0, Math.min(1, t));
  const seg = t * (stops.length - 1);
  const i = Math.min(Math.trunc(seg), stops.length - 2);
  return lerp(stops[i], stops[i + 1], seg - i);
}

export const dim = (c, k) => lerp(C.ink, c, k);

// term.Buffer: cols x rows cells of [char, fg, bg, bold]
export class Buffer {
  constructor(cols, rows, bg = C.bg) {
    this.cols = cols;
    this.rows = rows;
    this.bg = bg;
    this.cells = [];
    for (let y = 0; y < rows; y++) {
      const row = new Array(cols);
      for (let x = 0; x < cols; x++) row[x] = [' ', DEFAULT_FG, bg, false];
      this.cells.push(row);
    }
  }

  put(x, y, s, fg = null, bg = null, bold = false) {
    if (y < 0 || y >= this.rows) return x + s.length;
    const row = this.cells[y];
    for (let i = 0; i < s.length; i++) {
      const cx = x + i;
      if (cx >= 0 && cx < this.cols) {
        const c = row[cx];
        c[0] = s[i];
        if (fg) c[1] = fg;
        if (bg) c[2] = bg;
        c[3] = bold;
      }
    }
    return x + s.length;
  }
}

// pixel art: two pixel rows per cell with half blocks; grid rows are strings, '.' = empty
export function pixels(b, x, y, grid, colorf) {
  if (grid.length % 2) grid = grid.concat(['.'.repeat(grid[0].length)]);
  for (let r = 0; r < grid.length; r += 2) {
    const top = grid[r], bot = grid[r + 1];
    for (let cx = 0; cx < top.length; cx++) {
      const t = top[cx] !== '.', bo = (cx < bot.length ? bot[cx] : '.') !== '.';
      if (!(t || bo)) continue;
      const X = x + cx, Y = y + (r >> 1);
      if (!(X >= 0 && X < b.cols && Y >= 0 && Y < b.rows)) continue;
      const cell = b.cells[Y][X];
      const ct = t ? colorf(cx, r, top[cx]) : null;
      const cb = bo ? colorf(cx, r + 1, bot[cx]) : null;
      if (t && bo) b.cells[Y][X] = ct === cb ? ['█', ct, cell[2], false] : ['▀', ct, cb, false];
      else if (t) b.cells[Y][X] = ['▀', ct, cell[2], false];
      else b.cells[Y][X] = ['▄', cb, cell[2], false];
    }
  }
}

export const WM = {
  p: '....|....|###.|#..#|#..#|###.|#...|#...', o: '....|....|.##.|#..#|#..#|.##.|....|....',
  r: '...|...|#.#|##.|#..|#..|...|...', t: '.#.|.#.|###|.#.|.#.|.##|...|...',
  m: '.....|.....|####.|#.#.#|#.#.#|#.#.#|.....|.....', a: '....|....|.###|#..#|#.##|.#.#|....|....',
};

export function wordmark(b, x, y, s, colorf) {
  const rows = new Array(8).fill('');
  for (const ch of s) {
    const g = WM[ch].split('|');
    for (let i = 0; i < 8; i++) rows[i] += g[i] + '.';
  }
  pixels(b, x, y, rows, colorf);
  return rows[0].length;
}

export const CART = [
  '##############..', '###############.', '################', '##kkkkkkkkkkkk##',
  '##kwwwwwwwwwwk##', '##kwppwwwwwwwk##', '##kwppwwwwwwwk##', '##kwwwwwwwwwwk##',
  '##kkkkkkkkkkkk##', '################', '##r##r##r##r####', '################',
  '################', '.g.g.g.g.g.g.g..',
];

// the portmart cartridge logo at full reveal with all pins lit; phase cycles its gradient
export function cart(b, x, y, phase = 0) {
  pixels(b, x, y, CART, (cx, cy, ch) => {
    const t = 1 - Math.abs(pymod(cx / 15 * 0.6 + cy / 13 * 0.4 + phase, 2) - 1);
    if (ch === '#') return grad(OMP, t);
    if (ch === 'k') return C.ink;
    if (ch === 'w') return lerp('#2a2340', '#3a2f5c', cy / 13);
    if (ch === 'p') return C.cyan;
    if (ch === 'r') return dim(grad(OMP, t), 0.55);
    return C.gold;
  });
}
