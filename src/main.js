// The portmart.app teaser: one of the app's launch intros, then the settled logo with its cartridge
// gradient cycling. The cell grid covers the whole viewport; the logo spans about 70 % of the width and
// sits in the middle. A click, tap or key during an intro skips to the logo; on the logo it plays
// another intro (never the one just played, as in the app).
import { Buffer, C } from './draw.js';
import { title } from './intro/common.js';
import { INTROS } from './intro/index.js';

const LOGO_W = 57;             // cells from the cartridge's left edge to the wordmark's right edge
const LOGO_SHARE = 0.7;        // of the viewport width
const MIN_ROWS = 22;           // the app's grid height: the layout is drawn for at least this
const PHASE_RATE = 0.8;        // the title screen's cartridge gradient, cycles per second (screens.Splash)
const LAST_KEY = 'portmart.intro.last';

const canvas = document.getElementById('splash');
const ctx = canvas.getContext('2d', { alpha: false });
let G;                         // the grid: { cols, rows, cw (cell width, device px), ox, oy }
let play = null;               // { mod, seed, t0 } while an intro runs
let settled0 = 0;              // when the logo settled (performance.now ms)

function fit() {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(window.innerWidth * dpr), H = Math.round(window.innerHeight * dpr);
  canvas.width = W;
  canvas.height = H;
  // cell = cw x 2cw device px, so a half-block pixel is square
  const cw = Math.max(2, Math.floor(Math.min(LOGO_SHARE * W / LOGO_W, H / (2 * MIN_ROWS))));
  const ch = 2 * cw;
  const cols = Math.ceil(W / cw) + 2, rows = Math.ceil(H / ch) + 9;
  const lx = Math.floor((cols - 56) / 2), oy = Math.floor((rows - 22) / 2);
  // centre the logo's box (cells lx .. lx+57, rows 4+oy .. 11+oy) in the viewport
  G = { cols, rows, cw, ox: Math.round(W / 2 - (lx + LOGO_W / 2) * cw), oy: Math.round(H / 2 - (4 + oy + 3.5) * ch) };
}

function pickIntro() {
  let last = null;
  try { last = localStorage.getItem(LAST_KEY); } catch { /* storage off: any pick */ }
  const pool = INTROS.filter((m) => m.NAME !== last);
  const mod = pool[Math.floor(Math.random() * pool.length)];
  try { localStorage.setItem(LAST_KEY, mod.NAME); } catch { /* ignore */ }
  return mod;
}

function start() {
  play = { mod: pickIntro(), seed: Math.floor(Math.random() * 1e6), t0: 0 };
  play.mod.frame(new Buffer(G.cols, G.rows), 0, play.seed, G.cols, G.rows);   // warm its per-seed setup
  play.t0 = performance.now();
}

function settle(now) {
  play = null;
  settled0 = now;
}

// ░ and ▒ as ordered dither on a 4 x 8 sub-grid of the cell
const DITHER = { '░': [[0, 0], [2, 2], [0, 4], [2, 6]], '▒': [] };
for (let y = 0; y < 8; y++) for (let x = (y % 2); x < 4; x += 2) DITHER['▒'].push([x, y]);

function paint(b) {
  const { cw, ox, oy } = G, ch = 2 * cw;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < b.rows; y++) {
    const py = oy + y * ch;
    if (py + ch <= 0 || py >= canvas.height) continue;
    const row = b.cells[y];
    for (let x = 0; x < b.cols; x++) {
      const c = row[x], g = c[0];
      if (g === ' ') continue;
      const px = ox + x * cw;
      if (px + cw <= 0 || px >= canvas.width) continue;
      if (c[2] !== b.bg) {
        ctx.fillStyle = c[2];
        ctx.fillRect(px, py, cw, ch);
      }
      ctx.fillStyle = c[1];
      if (g === '█') ctx.fillRect(px, py, cw, ch);
      else if (g === '▀') ctx.fillRect(px, py, cw, cw);
      else if (g === '▄') ctx.fillRect(px, py + cw, cw, cw);
      else if (g === '·') {
        const d = Math.max(1, Math.round(cw / 5));
        ctx.fillRect(px + Math.round((cw - d) / 2), py + Math.round((ch - d) / 2), d, d);
      } else if (g === '▪') {
        const d = Math.max(1, Math.round(cw / 2));
        ctx.fillRect(px + Math.round((cw - d) / 2), py + Math.round((ch - d) / 2), d, d);
      } else if (DITHER[g]) {
        for (const [dx, dy] of DITHER[g]) {
          const x0 = Math.round(dx * cw / 4), y0 = Math.round(dy * ch / 8);
          ctx.fillRect(px + x0, py + y0, Math.round((dx + 1) * cw / 4) - x0, Math.round((dy + 1) * ch / 8) - y0);
        }
      }
    }
  }
}

function tick(now) {
  const b = new Buffer(G.cols, G.rows);
  if (play) {
    const p = (now - play.t0) / 1000 / play.mod.DURATION;
    if (p < 1) play.mod.frame(b, Math.max(0, p), play.seed, G.cols, G.rows);
    else settle(play.t0 + play.mod.DURATION * 1000);
  }
  if (!play) title(b, (now - settled0) / 1000 * PHASE_RATE);
  paint(b);
  requestAnimationFrame(tick);
}

function poke(e) {
  if (e.type === 'keydown' && (e.metaKey || e.ctrlKey || e.altKey || e.repeat)) return;
  if (play) settle(performance.now());
  else start();
}

fit();
window.addEventListener('resize', fit);
window.addEventListener('pointerdown', poke);
window.addEventListener('keydown', poke);
// start once the page is visible, so a background tab doesn't spend its intro unseen
function go() {
  if (document.visibilityState !== 'visible') return;
  document.removeEventListener('visibilitychange', go);
  start();
  requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange', go);
go();
