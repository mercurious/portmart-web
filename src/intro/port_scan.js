// Port of portmart's ui/intro/port_scan.py. A dim lattice of ports; lit cells drift in on eased, bowed
// paths and dock into the logo and wordmark, decoys fade out, the unused ports dissolve.
import { N, OMP, clamp, finalCells, luts, rng, smooth, tri } from './common.js';

export const NAME = 'port_scan';
export const DURATION = 1.2;

const DOT = '#2c3345';
const T_ARRIVE = [0.30, 0.80];
const DOCK_FLASH = 0.05;
const DISSOLVE = [0.50, 0.95];

const cache = new Map();

function setup(seed, cols, rows) {
  const key = seed + ':' + cols + 'x' + rows;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rng(seed, cols, rows);
  const fin = finalCells(cols, rows);
  const mode = seed % 4, src = Math.floor(seed / 4) % 4;
  const xs = fin.map((f) => f[0]), ys = fin.map((f) => f[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1;
  const y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
  const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;

  const start = () => {
    const side = r.random() < 0.5;
    if (src === 0) return [r.uniform(1, cols - 2), r.uniform(0, rows - 1)];
    if (src === 1) {
      const sx = side ? r.uniform(0, 5) : cols - 1 - r.uniform(0, 5);
      return [sx, r.uniform(0, rows - 1)];
    }
    if (src === 2) return [r.uniform(1, cols - 2), -r.uniform(0, 3)];
    return [r.uniform(1, cols - 2), rows + r.uniform(0, 3)];
  };

  const parts = [];
  for (const [x, y, ch, fg, bg] of fin) {
    // Python builds the whole tuple, so all four draws happen whatever the mode
    const opts = [(x - x0) / (x1 - x0), r.random(), Math.min(1, Math.hypot((x - cxm) / 30, (y - cym) / 8)), (y - y0) / (y1 - y0)];
    const base = opts[mode];
    const arrive = T_ARRIVE[0] + (T_ARRIVE[1] - T_ARRIVE[0]) * clamp(0.6 * base + 0.4 * r.random());
    const dur = r.uniform(0.22, 0.38);
    const [sx, sy] = start();
    const bow = r.uniform(-1, 1) * 4 * ((seed % 3) + 1) / 2;
    parts.push([x, y, ch, fg, bg, sx, sy, arrive - dur, dur, bow, r.random()]);
  }
  parts.sort((a, b) => a[7] - b[7]);
  const decoys = [];
  for (let n = Math.max(24, Math.floor(fin.length / 5)); n > 0; n--) {
    const tx = r.uniform(x0, x1), ty = r.uniform(y0, y1);
    const [sx, sy] = start();
    const ts = r.uniform(0.02, 0.45);
    decoys.push([tx, ty, sx, sy, ts, r.uniform(0.3, 0.45), r.uniform(-1, 1) * 5, r.random()]);
  }
  const lattice = [];
  for (let y = 1; y < rows - 1; y += 2) {
    for (let x = 2 + ((y >> 1) % 2) * 2; x < cols - 2; x += 4) {
      lattice.push([x, y, DISSOLVE[0] + (DISSOLVE[1] - DISSOLVE[0]) * r.random()]);
    }
  }
  const out = { parts, decoys, lattice, hue: r.random() * 2 };
  cache.set(key, out);
  return out;
}

function pos(sx, sy, tx, ty, bow, u) {
  const e = smooth(u);
  const s = Math.sin(Math.PI * e) * bow;
  return [sx + (tx - sx) * e + s * 0.5, sy + (ty - sy) * e + s * 0.25];
}

export function frame(buf, t, seed, cols, rows) {
  const S = setup(seed, cols, rows);
  const cells = buf.cells, hue = S.hue;
  const omp = luts(OMP)[0];
  // port lattice
  for (const [x, y, td] of S.lattice) {
    if (t < td) {
      const c = cells[y][x];
      c[0] = '·'; c[1] = DOT;
    }
  }
  // decoys: drift toward the logo and fade out before arriving
  for (const [tx, ty, sx, sy, ts, dur, bow, h] of S.decoys) {
    if (t < ts - 0.06) continue;
    const u = (t - ts) / dur;
    if (u >= 1) continue;
    let [x, y] = pos(sx, sy, tx, ty, bow, clamp(u));
    x = Math.trunc(x + 0.5); y = Math.trunc(y + 0.5);
    if (x >= 0 && x < cols && y >= 0 && y < rows) {
      const col = omp[Math.trunc(tri(x / cols + hue + h) * (N - 1))];
      const c = cells[y][x];
      c[0] = u < 0.5 ? '█' : u < 0.75 ? '▒' : '░'; c[1] = col;
    }
  }
  // real cells: blink on, fly, dock
  for (const [x, y, ch, fg, bg, sx, sy, ts, dur, bow, h] of S.parts) {
    const u = (t - ts) / dur;
    if (u >= 1) {                                    // docked: white flash, then the true glyph
      const flash = u - 1 < DOCK_FLASH / dur;
      cells[y][x] = [ch, flash ? '#ffffff' : fg, bg, false];
      continue;
    }
    if (u < -0.25) continue;
    const col = omp[Math.trunc(tri(x / cols + hue + h * 0.2) * (N - 1))];
    if (u < 0) {                                     // lit on its start port, waiting
      const fx = Math.trunc(sx + 0.5), fy = Math.trunc(sy + 0.5);
      if (fx >= 0 && fx < cols && fy >= 0 && fy < rows && Math.trunc(t * 16 + h * 4) % 2 === 0) {
        const c = cells[fy][fx];
        c[0] = '▪'; c[1] = col;
      }
      continue;
    }
    let [fx, fy] = pos(sx, sy, x, y, bow, u);
    let [qx, qy] = pos(sx, sy, x, y, bow, u - 0.12);
    fx = Math.trunc(fx + 0.5); fy = Math.trunc(fy + 0.5); qx = Math.trunc(qx + 0.5); qy = Math.trunc(qy + 0.5);
    if (qx >= 0 && qx < cols && qy >= 0 && qy < rows && (qx !== fx || qy !== fy)) {
      const c = cells[qy][qx];
      c[0] = '▒'; c[1] = col;
    }
    if (fx >= 0 && fx < cols && fy >= 0 && fy < rows) {
      const c = cells[fy][fx];
      c[0] = '█'; c[1] = col;
    }
  }
}
