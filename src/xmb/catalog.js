// The published catalog (portmart's CONTRACT R8) as the XMB reads it. normalize() and rows() are pure, for the tests.
//
// Media per app, in order: a catalog video loop (media.web.video), else a labelled placeholder loop; then the
// catalog stills (media.web.stills, WebP; or the screens' PNGs from a catalog built before media.web), else
// labelled placeholder art. Private apps are kept with `private: true`; the web context hides them.

export const CATALOG_URL = 'https://mercurious.github.io/portmart-catalog/catalog.json';
export const CATEGORIES = ['play', 'studio', 'chat', 'media', 'net', 'system'];

// Site-local stand-ins for apps the catalog has no media for yet (PRODUCT.md: anything not from the real app
// is labelled). Paths are relative to the site root.
export const PLACEHOLDERS = {
  autojam: { stills: ['/placeholder/autojam/1.webp'] },
  'rap-machine-gemma': { stills: ['/placeholder/rap-machine-gemma/1.webp'] },
  'voxel-gt': { loop: '/placeholder/voxel-gt/preview.mp4' },
};

export function normalize(doc, url = CATALOG_URL) {
  if (!doc || doc.version !== 1 || !Array.isArray(doc.apps)) throw new Error('not a portmart catalog');
  const base = doc.media_base || new URL('media/', url).href;
  const apps = [];
  for (const a of doc.apps) {
    const p = (a.platforms || {})['rocknix-aarch64'];
    if (!p || !CATEGORIES.includes(a.category)) continue;
    const src = (p.source || {}).type || 'unknown';
    const res = p.resolved || null;
    const dir = `${base}${a.id}/`;
    const m = a.media || {};
    apps.push({
      id: a.id, name: a.name, short: a.short || a.name, author: a.author, category: a.category,
      tags: a.tags || [], blurb: a.blurb || '', community: !!a.community, private: !!a.private,
      kind: a.kind, depends: a.depends || [], src, rom: !!p.rom,
      url: src === 'web' ? p.source.url : null,
      size_mb: typeof p.size_mb === 'number' ? p.size_mb : null,
      prerelease: !!(p.source && p.source.prerelease),
      // what the release side says, for the web context (no device there); null for web apps
      release: src === 'web' ? null : res && res.status === 'ok' ? { version: res.version } : { unavailable: (res && res.reason) || 'no release' },
      icon: m.icon ? dir + m.icon : null,
      media: mediaOf(a.id, m, dir),
    });
  }
  apps.sort((x, y) => x.name.localeCompare(y.name, 'en', { sensitivity: 'base' }));
  return { generated: doc.generated || null, portmart: doc.portmart || null, apps };
}

function mediaOf(id, m, dir) {
  const out = [];
  const ph = PLACEHOLDERS[id] || {};
  const web = m.web || {};
  if (web.video) {
    out.push({ kind: 'video', src: dir + web.video.mp4, av1: dir + web.video.webm, poster: dir + web.video.poster,
      caption: web.video.caption, label: web.video.prototype ? 'EARLY BUILD' : '' });
  } else if (ph.loop) {
    out.push({ kind: 'video', src: ph.loop, caption: 'a pan over real captures', label: 'PREVIEW LOOP · PLACEHOLDER' });
  }
  const stills = web.stills || m.screens || [];
  for (const s of stills) out.push({ kind: 'img', src: dir + s.file, caption: s.caption, label: s.prototype ? 'EARLY BUILD' : '' });
  if (!stills.length) for (const src of ph.stills || []) out.push({ kind: 'img', src, caption: 'derived art', label: 'PLACEHOLDER ART' });
  return out;
}

// The XMB's rows, in order, each with its apps. Device: INSTALLED leads and private apps show; web: PORTMART
// (the installer) leads and private apps are hidden. `states`: the engine's `list`, by id.
export function rows(apps, { device = false, states = null } = {}) {
  const shown = device ? apps : apps.filter((a) => !a.private);
  const out = [];
  if (device) out.push({ id: 'installed', apps: shown.filter((a) => states && states[a.id] && states[a.id].installed) });
  else out.push({ id: 'portmart', apps: [{ id: '@sh', name: 'macOS · Linux', short: 'SH' }, { id: '@ps', name: 'Windows', short: 'PS' }] });
  for (const c of CATEGORIES) {
    const list = shown.filter((a) => a.category === c);
    if (list.length) out.push({ id: c, apps: list });
  }
  return out;
}

export async function load(url = CATALOG_URL) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`catalog: HTTP ${r.status}`);
  return normalize(await r.json(), url);
}
