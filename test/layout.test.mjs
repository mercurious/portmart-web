// src/xmb/layout.js pins the frozen layout (portmart DESIGN.md, Layout; dossier §18). Captures are framed
// against these rows, so a change here is a design change, not a refactor.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bigWidth } from '../src/xmb/glyphs.js';
import { fit, fitTitle, layout } from '../src/xmb/layout.js';

test('1920x1080 (desktop and the Flip 2): the frozen landscape rows', () => {
  const G = fit(1920, 1080);
  assert.deepEqual([G.cols, G.rows, G.cw, G.ch, G.ox, G.oy, G.portrait], [112, 31, 17, 34, 8, 13, false]);
  const L = layout(G);
  assert.deepEqual(
    [L.statusY, L.metaY, L.fy, L.th, L.tw, L.blurbY, L.actY, L.hintsY, L.sx, L.mx, L.right, L.blurbW],
    [1, 17, 19, 4, 8, 24, 27, 29, 22, 6, 106, 64]);
  // DESIGN.md: a one-line full-size title starts at 438 px (41%), a half-size one at 489 px (45%)
  const top = (k) => G.oy + (L.metaY - 4 * k - (k < 1 ? 0.5 : 0) - 0.5) * G.ch;
  assert.equal(top(1), 438);
  assert.equal(top(0.5), 489);
  assert.ok(top(1) / 1080 > 0.4);
});

test('the info panel docks right at 30% and narrows the stack', () => {
  const G = fit(1920, 1080);
  const L = layout(G, true);
  assert.deepEqual([L.info.x, L.info.w, L.right], [72, 34, 69]);
});

test('larger screens keep the composition with bigger cells; phones go portrait', () => {
  const big = fit(3840, 2160);
  assert.deepEqual([big.cw, big.rows, big.portrait], [34, 31, false]);
  assert.equal(layout(big).actY, layout(fit(1920, 1080)).actY);
  const phone = fit(390, 844);
  assert.deepEqual([phone.cw, phone.cols, phone.portrait], [9, 43, true]);
  const P = layout(phone);
  assert.deepEqual([P.tw, P.th, P.blurbRows, P.actRows], [6, 3, 3, 2]);
});

test('titles prefer one line: full, half size, short, and two lines last', () => {
  const W = 84;   // the 1080p title width in cells
  assert.deepEqual(fitTitle('Pickleball', 'Pickleball', W, bigWidth), { lines: ['PICKLEBALL'], k: 1 });
  assert.deepEqual(fitTitle('Chrome Music Lab', 'Music Lab', W, bigWidth), { lines: ['CHROME MUSIC LAB'], k: 0.5 });
  assert.deepEqual(fitTitle('Underground Rap Machine', 'URM', W, bigWidth), { lines: ['UNDERGROUND RAP MACHINE'], k: 0.5 });
  assert.deepEqual(fitTitle('Underground Rap Machine Deluxe Edition', 'URM DX', W, bigWidth), { lines: ['URM DX'], k: 1 });
  assert.deepEqual(fitTitle('Alpha Beta', 'AB', 20, bigWidth), { lines: ['AB'], k: 1 });
  assert.equal(fitTitle('Supercalifragilistic', 'Supercalifragilistic', 10, bigWidth), null);
});
