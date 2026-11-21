// Block glyphs for the XMB (DESIGN.md Typography: the TUI's F57 5x7 font, the wordmark and the cartridge),
// drawn on canvas with one glyph pixel per half cell and an ink copy one pixel down-right.

export const OMP = ['#ff4fd8', '#9362f4', '#00dbe4'];
export const SUNSET = ['#ffb000', '#ff4fd8', '#9362f4'];

const F57 = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.', J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '####.|....#|....#|.###.|....#|....#|####.',
  4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
  8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
  ' ': '.....|.....|.....|.....|.....|.....|.....', '-': '.....|.....|.....|.###.|.....|.....|.....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....', '.': '.....|.....|.....|.....|.....|.##..|.##..',
};
const WM = {
  p: '....|....|###.|#..#|#..#|###.|#...|#...', o: '....|....|.##.|#..#|#..#|.##.|....|....',
  r: '...|...|#.#|##.|#..|#..|...|...', t: '.#.|.#.|###|.#.|.#.|.##|...|...',
  m: '.....|.....|####.|#.#.#|#.#.#|#.#.#|.....|.....', a: '....|....|.###|#..#|#.##|.#.#|....|....',
};
export const CART = [
  '##############..', '###############.', '################', '##kkkkkkkkkkkk##',
  '##kwwwwwwwwwwk##', '##kwppwwwwwwwk##', '##kwppwwwwwwwk##', '##kwwwwwwwwwwk##',
  '##kkkkkkkkkkkk##', '################', '##r##r##r##r####', '################',
  '################', '.g.g.g.g.g.g.g..',
];

const hx = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const lerp = (a, b, t) => { const A = hx(a), B = hx(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(' ')})`; };
export const grad = (stops, t) => {
  t = Math.max(0, Math.min(1, t));
  const s = t * (stops.length - 1), i = Math.min(Math.floor(s), stops.length - 2);
  return lerp(stops[i], stops[i + 1], s - i);
};

export const bigRows = (s) => {
  const rows = Array(7).fill('');
  for (const ch of s.toUpperCase()) (F57[ch] || F57[' ']).split('|').forEach((r, i) => { rows[i] += `${r}.`; });
  return rows.map((r) => r.slice(0, -1));
};
export const bigWidth = (s) => s.length * 6 - 1;

export function cartColor(phase) {
  return (cx, cy, ch) => {
    const t = 1 - Math.abs((((cx / 15) * 0.6 + (cy / 13) * 0.4 + phase) % 2 + 2) % 2 - 1);
    if (ch === '#') return grad(OMP, t);
    if (ch === 'k') return '#05060a';
    if (ch === 'w') return lerp('#2a2340', '#3a2f5c', cy / 13);
    if (ch === 'p') return '#00dbe4';
    if (ch === 'r') return lerp('#05060a', '#9362f4', 0.55);
    return '#d4c090';
  };
}

// the cartridge, a 3 px gap, then the 'portmart' wordmark (8 px tall) beside its lower half
export function logoRows() {
  const word = Array(8).fill('');
  for (const ch of 'portmart') WM[ch].split('|').forEach((r, i) => { word[i] += `${r}.`; });
  const rows = CART.map((r) => `${r}...`);
  for (let i = 0; i < 8; i++) rows[i + 4] += word[i];
  return rows;
}

// pixel rows -> canvas; one pixel = cw x cw CSS px, plus the ink copy one pixel down-right
export function pixelCanvas(rows, cw, colorf, label = '') {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(...rows.map((r) => r.length)) + 1, h = rows.length + 1;
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * cw * dpr); cv.height = Math.round(Math.ceil(h / 2) * 2 * cw * dpr);
  cv.style.width = `${w * cw}px`; cv.style.height = `${Math.ceil(h / 2) * 2 * cw}px`;
  if (label) { cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', label); } else cv.setAttribute('aria-hidden', 'true');
  const g = cv.getContext('2d');
  const p = cw * dpr;
  for (const pass of [0, 1]) {
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      g.fillStyle = pass ? colorf(x, y, ch, w - 1, h - 1) : 'rgb(5 6 10 / .85)';
      g.fillRect(Math.round((x + 1 - pass) * p), Math.round((y + 1 - pass) * p), Math.ceil(p), Math.ceil(p));
    }
  }
  return cv;
}
