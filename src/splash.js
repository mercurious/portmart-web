// The boot: one of the app's launch intros (the parity-tested ports in intro/), drawn on its own canvas over
// the XMB while the catalog loads. It ends with the intro, or early on any click, tap, key or pad button;
// the canvas then fades out. Never the intro played last time (as in the app). Reduced motion: no intro.
import { Buffer, C } from './draw.js';
import { INTROS } from './intro/index.js';

const LOGO_W = 57;             // cells from the cartridge's left edge to the wordmark's right edge
const LOGO_SHARE = 0.7;        // of the viewport width
const MIN_ROWS = 22;           // the app's grid height: the layout is drawn for at least this
const LAST_KEY = 'portmart.intro.last';

// ░ and ▒ as ordered dither on a 4 x 8 sub-grid of the cell
const DITHER = { '░': [[0, 0], [2, 2], [0, 4], [2, 6]], '▒': [] };
for (let y = 0; y < 8; y++) for (let x = (y % 2); x < 4; x += 2) DITHER['▒'].push([x, y]);

function pickIntro() {
  let last = null;
  try { last = localStorage.getItem(LAST_KEY); } catch { /* storage off: any pick */ }
  const pool = INTROS.filter((m) => m.NAME !== last);
  const mod = pool[Math.floor(Math.random() * pool.length)];
  try { localStorage.setItem(LAST_KEY, mod.NAME); } catch { /* ignore */ }
  return mod;
}

export function runSplash(canvas) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { canvas.remove(); return Promise.resolve(); }
  const ctx = canvas.getContext('2d', { alpha: false });
  let G;
  const fit = () => {
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
  };

  const paint = (b) => {
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
        if (c[2] !== b.bg) { ctx.fillStyle = c[2]; ctx.fillRect(px, py, cw, ch); }
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
  };

  return new Promise((resolve) => {
    fit();
    addEventListener('resize', fit);
    const mod = pickIntro(), seed = Math.floor(Math.random() * 1e6);
    mod.frame(new Buffer(G.cols, G.rows), 0, seed, G.cols, G.rows);   // warm its per-seed setup
    let t0 = 0, done = false;
    // the press that skips is consumed here, so it doesn't also act on the XMB underneath
    const skip = (e) => { e.stopPropagation(); e.preventDefault(); finish(); };
    function finish() {
      if (done) return;
      done = true;
      removeEventListener('resize', fit);
      removeEventListener('pointerdown', skip, true);
      removeEventListener('keydown', skip, true);
      canvas.classList.add('gone');
      setTimeout(() => canvas.remove(), 400);
      resolve();
    }
    addEventListener('pointerdown', skip, true);
    addEventListener('keydown', skip, true);
    const tick = (now) => {
      if (done) return;
      for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) if (gp && gp.buttons.some((b) => b.pressed)) { finish(); return; }
      if (!t0) t0 = now;
      const p = (now - t0) / 1000 / mod.DURATION;
      const b = new Buffer(G.cols, G.rows);
      mod.frame(b, Math.min(1, p), seed, G.cols, G.rows);
      paint(b);
      if (p >= 1) { setTimeout(finish, 350); return; }
      requestAnimationFrame(tick);
    };
    // start once the page is visible, so a background tab doesn't spend its intro unseen
    const go = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', go);
      requestAnimationFrame(tick);
    };
    document.addEventListener('visibilitychange', go);
    go();
  });
}
