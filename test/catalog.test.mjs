// src/xmb/catalog.js: the published catalog (portmart CONTRACT R8) as the XMB reads it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { CATALOG_URL, PLACEHOLDERS, normalize, rows } from '../src/xmb/catalog.js';

const BASE = 'https://cat.example/media/';
const app = (id, extra = {}, plat = {}, media = {}) => ({
  id, name: id.toUpperCase(), short: id, author: 'a', category: 'play', tags: [], blurb: `${id} blurb`, community: false,
  kind: 'app', depends: [], ...extra,
  platforms: { 'rocknix-aarch64': { source: { type: 'github-release' }, size_mb: 1, resolved: { status: 'ok', version: '1.0' }, ...plat } },
  media: { icon: 'icon.png', icon_generated: false, screens: [], ...media },
});
const doc = (apps, extra = {}) => ({ version: 1, generated: 'g', media_base: BASE, apps, ...extra });

test('media.web wins: the video loop first, then the WebP stills, with labels from prototype', () => {
  const a = app('zed', {}, {}, {
    screens: [{ file: 'shot-1.png', caption: 'one', prototype: false }],
    web: {
      stills: [{ file: 'web/shot-1.webp', caption: 'one', prototype: false }, { file: 'web/shot-2.webp', caption: 'two', prototype: true }],
      video: { mp4: 'web/loop.mp4', webm: 'web/loop.webm', poster: 'web/shot-1.webp', caption: 'loop', prototype: false },
    },
  });
  const [m] = normalize(doc([a])).apps;
  assert.deepEqual(m.media.map((x) => [x.kind, x.src, x.label]), [
    ['video', `${BASE}zed/web/loop.mp4`, ''],
    ['img', `${BASE}zed/web/shot-1.webp`, ''],
    ['img', `${BASE}zed/web/shot-2.webp`, 'EARLY BUILD'],
  ]);
  assert.equal(m.media[0].av1, `${BASE}zed/web/loop.webm`);
  assert.equal(m.icon, `${BASE}zed/icon.png`);
});

test('a catalog built before media.web falls back to the screens, and placeholders are labelled', () => {
  const real = app('voxel-gt', {}, {}, { screens: [{ file: 'shot-1.png', caption: 'title', prototype: false }] });
  const none = app('autojam');
  const out = normalize(doc([real, none])).apps;
  const vgt = out.find((x) => x.id === 'voxel-gt'), aj = out.find((x) => x.id === 'autojam');
  assert.deepEqual(vgt.media.map((x) => [x.kind, x.src, x.label]), [
    ['video', PLACEHOLDERS['voxel-gt'].loop, 'PREVIEW LOOP · PLACEHOLDER'],
    ['img', `${BASE}voxel-gt/shot-1.png`, ''],
  ]);
  assert.deepEqual(aj.media.map((x) => x.label), ['PLACEHOLDER ART']);
});

test('release state for the web: a version, unavailable with its reason, or none for web apps', () => {
  const out = normalize(doc([
    app('ok'),
    app('gone', {}, { resolved: { status: 'unavailable', reason: 'no published release' } }),
    app('site', { depends: ['donkey'] }, { source: { type: 'web', url: 'https://x.example/' }, resolved: undefined }),
  ])).apps;
  const by = Object.fromEntries(out.map((x) => [x.id, x]));
  assert.deepEqual(by.ok.release, { version: '1.0' });
  assert.deepEqual(by.gone.release, { unavailable: 'no published release' });
  assert.equal(by.site.release, null);
  assert.equal(by.site.url, 'https://x.example/');
});

test('the web hides private apps; the handheld shows them and leads with INSTALLED from the engine', () => {
  const apps = normalize(doc([app('pub'), app('priv', { private: true }), app('tune', { category: 'media' })])).apps;
  const web = rows(apps);
  assert.deepEqual(web.map((r) => r.id), ['portmart', 'play', 'media']);
  assert.deepEqual(web[1].apps.map((a) => a.id), ['pub']);
  const states = { pub: { state: 'installed', installed: '1.0' }, priv: { state: 'available', installed: null } };
  const dev = rows(apps, { device: true, states });
  assert.deepEqual(dev.map((r) => r.id), ['installed', 'play', 'media']);
  assert.deepEqual(dev[0].apps.map((a) => a.id), ['pub']);
  assert.deepEqual(dev[1].apps.map((a) => a.id).sort(), ['priv', 'pub']);
});

test('apps sort by name, unknown categories and other platforms drop out, media_base defaults beside the catalog', () => {
  const d = doc([app('b'), app('a'), app('x', { category: 'nope' }), { ...app('y'), platforms: { 'onion-armv7': {} } }]);
  delete d.media_base;
  const out = normalize(d);
  assert.deepEqual(out.apps.map((a) => a.id), ['a', 'b']);
  assert.ok(out.apps[0].icon.startsWith(new URL('media/', CATALOG_URL).href));
  assert.throws(() => normalize({ version: 2, apps: [] }), /not a portmart catalog/);
});
