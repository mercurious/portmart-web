// The frozen layout (portmart DESIGN.md, Layout). Pure: viewport in, cells out, so the tests can pin it.
//
// The cell follows the screen's height (H/64 landscape), so type stays legible on every screen; wider screens
// gain columns and spend them on margins and gaps, not density. Cells are 1:2 as in foot. The landscape stack
// sits as low as it can (the Low Stack Rule), leaving the top ~40% to the media.

export function fit(W, H) {
  const portrait = H > W * 1.1;
  const cw = portrait
    ? Math.max(7, Math.floor(Math.min(W / 42, H / 76)))
    : Math.max(8, Math.min(40, Math.round(H / 64), Math.floor(W / 100)));
  const cols = Math.floor(W / cw), rows = Math.floor(H / (2 * cw));
  return { cols, rows, cw, ch: 2 * cw, portrait, ox: Math.floor((W - cols * cw) / 2), oy: Math.floor((H - rows * 2 * cw) / 2) };
}

// Every position the renderer uses, in cells. `info`: the info panel is open.
export function layout(G, info = false) {
  const { cols: C, rows: R, portrait } = G;
  if (!portrait) {
    const mx = Math.max(3, Math.round(C * 0.05));
    const tw = Math.max(8, Math.round((C * 0.07) / 2) * 2), th = tw / 2;
    const infoW = Math.max(30, Math.round(C * 0.3)), infoX = C - mx - infoW;
    const right = info ? infoX - 3 : C - mx;
    const sx = mx + 16, actY = R - 4, blurbY = actY - 3, fy = blurbY - 1 - th;
    return { mx, statusY: 1, sx, railX: mx, railW: 13, tw, th, gap: 2, fy, catY: fy + Math.floor(th / 2), metaY: fy - 2,
      blurbY, blurbRows: 2, blurbW: Math.min(64, right - sx), actY, actRows: 1, actW: C - mx - sx, hintsY: R - 2,
      right, info: { x: infoX, y: 3, w: infoW, h: actY - 5 }, labelY: 3, scrimCols: sx + 4 };
  }
  const mx = 2, actY = R - 5, blurbY = actY - 4, nextY = blurbY - 2, fy = nextY - 4;
  return { mx, statusY: 1, sx: mx, tw: 6, th: 3, gap: 2, fy, metaY: fy - 4, prevY: fy - 2, nextY,
    blurbY, blurbRows: 3, blurbW: C - 2 * mx, actY, actRows: 2, actW: C - 2 * mx, hintsY: R - 2, right: C - mx,
    info: { x: 0, y: 3, w: C }, labelY: 3, scrimCols: 0 };
}

// Block-title fitting: one line keeps the stack low. The name, the name at half size, `short`, `short` at half
// size; two lines only when none of those fit. Returns { lines, k } or null (plain text).
export function fitTitle(name, short, width, bigWidth) {
  const fitLines = (s, k, max) => {
    const out = [];
    for (const wd of s.toUpperCase().split(' ')) {
      const last = out[out.length - 1];
      if (last && bigWidth(`${last} ${wd}`) * k <= width) out[out.length - 1] = `${last} ${wd}`; else out.push(wd);
    }
    return out.length <= max && out.every((l) => bigWidth(l) * k <= width) ? out : null;
  };
  for (const [s, k, max] of [[name, 1, 1], [name, 0.5, 1], [short, 1, 1], [short, 0.5, 1], [name, 1, 2], [name, 0.5, 2]]) {
    const lines = fitLines(s, k, max);
    if (lines) return { lines, k };
  }
  return null;
}
