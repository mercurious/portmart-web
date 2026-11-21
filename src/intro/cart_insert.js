// Port of portmart's ui/intro/cart_insert.py. A cartridge drops between two guide rails into a slot,
// pins light, an OMP gradient sweeps the shell, `portmart` types in; the rails fade last.
import { C, SUNSET, lerp, pyround } from '../draw.js';
import { GOLD, LETTERS, OMP, WORD_COLOR, blit, cartPx, clamp, layout, luts, pk, rng, smooth, tri, wordPx } from './common.js';

export const NAME = 'cart_insert';
export const DURATION = 1.2;

const PALETTES = [SUNSET, ['#00dbe4', '#9362f4', '#ff4fd8'], ['#ffb000', '#ff5a6e', '#ff4fd8'],
  ['#4ade80', '#00dbe4', '#9362f4']];
const RAIL = '#1c2130', SLOT = '#232838', LIP = '#3a4150';
const T_LAND = 0.36;
const FRAME = 1 / 16 / DURATION;
const PIN_T0 = 0.42, PIN_DT = 0.045;
const SWEEP_T0 = 0.40, SWEEP_T1 = 0.76;
const TYPE_T0 = 0.52, TYPE_DT = 0.047;
const SLOT_FADE = [0.88, 0.97];

const cache = new Map();

function setup(seed, cols, rows) {
  const key = seed + ':' + cols + 'x' + rows;
  let hit = cache.get(key);
  if (!hit) {
    const r = rng(seed, cols, rows);
    const order = [0, 1, 2, 3, 4, 5, 6, 7];
    if (seed % 3 === 1) r.shuffle(order);
    else if (seed % 3 === 2) order.reverse();
    hit = {
      pal: luts(PALETTES[seed % 4]), hue: (seed * 0.37) % 1.2, bounce: 1 + (seed % 2),
      land: T_LAND + r.uniform(-0.03, 0.03), order,
    };
    cache.set(key, hit);
  }
  return hit;
}

export function frame(buf, t, seed, cols, rows) {
  const S = setup(seed, cols, rows);
  const [lx, cy, wx, wy] = layout(cols, rows);
  const [omp, ompDim, ompHot] = luts(OMP);
  const [pal, palDim, palHot] = S.pal;
  const px = new Map();

  // cart height: free fall, one-frame bounce, seated
  const land = S.land;
  let off;
  if (t < land) {
    const u = t / land;
    off = -(cy + 14) * (1 - u * u);
  } else if (t < land + 1.2 * FRAME) off = -S.bounce;
  else off = 0;
  const y0 = Math.trunc(pyround(cy + off));

  // slot + rails, fading out at the end
  const fade = smooth((t - SLOT_FADE[0]) / (SLOT_FADE[1] - SLOT_FADE[0]));
  if (fade < 1) {
    const bg = C.bg;
    const lit = t >= land ? clamp(1 - (t - land) / 0.2) : 0;
    const lip0 = lerp(LIP, C.cyan, lit * 0.8);
    const rail = lerp(RAIL, bg, fade), slot = lerp(SLOT, bg, fade), lip = lerp(lip0, bg, fade);
    for (const x of [lx - 2, lx - 1, lx + 16, lx + 17]) for (let y = cy + 4; y < cy + 14; y++) px.set(pk(x, y), rail);
    for (let x = lx - 2; x < lx + 18; x++) {
      px.set(pk(x, cy + 14), lip);
      for (let y = cy + 15; y < cy + 18; y++) px.set(pk(x, y), slot);
    }
    for (let k = 0; k < 7; k++) if (t >= PIN_T0 + k * PIN_DT) px.set(pk(lx + 1 + 2 * k, cy + 14), lerp('#6b5a2a', bg, fade));
  }

  // body: palette ahead of the sweep, OMP behind it, a hot edge on the sweep
  const ph = S.hue * (1 - t) ** 2;
  const sweep = t > SWEEP_T0 ? smooth((t - SWEEP_T0) / (SWEEP_T1 - SWEEP_T0)) * 1.5 - 0.25 : -1;
  const BAND = 0.07;
  const body = (cx, cy_, s, dim) => {
    const i = Math.trunc(tri(s + ph) * 127 + 0.5);
    const d = cx / 15 - sweep;
    if (d < -BAND) return (dim ? ompDim : omp)[i];
    if (d > BAND) return (dim ? palDim : pal)[i];
    return d < 0 ? ompHot[i] : palHot[i];
  };
  const pins = [];
  for (let k = 0; k < 7; k++) {
    const age = t - (PIN_T0 + k * PIN_DT);
    pins.push(age < 0 ? null : age < 0.05 ? '#ffffff' : GOLD);
  }
  cartPx(px, lx, y0, body, pins);

  // wordmark typing + cursor
  const order = S.order;
  const shown = [];
  for (let i = 0; i < 8; i++) if (t >= TYPE_T0 + order[i] * TYPE_DT) shown.push(i);
  wordPx(px, wx, wy, shown, (i) => (t - (TYPE_T0 + order[i] * TYPE_DT) < 0.03 ? '#ffffff' : WORD_COLOR));
  blit(buf, px);
  if (TYPE_T0 - 0.04 <= t && t < 0.90 && Math.trunc(t * 16) % 2 === 0) {
    const nxt = [];
    for (let i = 0; i < 8; i++) if (!shown.includes(i)) nxt.push(i);
    if (nxt.length) {
      let i = nxt[0];
      for (const j of nxt) if (order[j] < order[i]) i = j;
      const x = wx + LETTERS[i][0];
      for (const yy of [(wy >> 1) + 1, (wy >> 1) + 2]) buf.put(x, yy, '█', C.cyan);
    }
  }
}
