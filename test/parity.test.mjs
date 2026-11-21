// The web intros must draw exactly what the app draws: every frame in test/fixtures.json (recorded from
// the app's Python by tools/fixtures.py) is rebuilt here and compared by hash.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Buffer } from '../src/draw.js';
import { INTROS } from '../src/intro/index.js';
import { title } from '../src/intro/common.js';
import { PyRandom } from '../src/pyrandom.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
const digest = (b) => createHash('sha1').update(JSON.stringify(b.cells)).digest('hex');

test('random matches CPython', () => {
  for (const [seed, want] of Object.entries(fx.rng)) {
    const r = new PyRandom(BigInt(seed));
    const got = { random: Array.from({ length: 5 }, () => r.random()), uniform: r.uniform(-3, 9) };
    const order = [0, 1, 2, 3, 4, 5, 6, 7];
    r.shuffle(order);
    assert.deepEqual({ ...got, shuffle: order }, want, `seed ${seed}`);
  }
});

test('every intro is recorded', () => {
  const names = new Set(Object.keys(fx.frames).map((k) => k.split('/')[0]));
  assert.deepEqual([...names].sort(), INTROS.map((m) => m.NAME).sort());
});

for (const mod of INTROS) {
  test(`${mod.NAME} frames match the app`, () => {
    const bad = [];
    for (const seed of fx.seeds) {
      for (const [cols, rows] of fx.grids) {
        fx.ts.forEach((t, i) => {
          const key = `${mod.NAME}/${seed}/${cols}x${rows}/${i}`;
          const b = new Buffer(cols, rows);
          mod.frame(b, t, seed, cols, rows);
          if (digest(b) !== fx.frames[key]) bad.push(key);
        });
      }
    }
    assert.deepEqual(bad, []);
  });
}

test('settled title matches the app at every phase', () => {
  for (const [cols, rows] of fx.grids) {
    for (const p of fx.phases) {
      const b = new Buffer(cols, rows);
      title(b, p);
      // Python's str(float) keys: 0.0, 0.37, ...
      const key = `${cols}x${rows}/${Number.isInteger(p) ? p.toFixed(1) : p}`;
      assert.equal(digest(b), fx.titles[key], key);
    }
  }
});
