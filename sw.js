// portmart.app's service worker (portmart PRODUCT.md: a first launch needs the network, then this serves the
// last build). tools/build.mjs fills in VERSION (a hash of the site) and SHELL (every file of the build).
//   shell     cache-first, from the precache of this VERSION
//   catalog   network-first, falling back to the last catalog.json it saw
//   images    cache-first once fetched (icons and stills from the catalog site)
//   video     straight to the network: range requests don't cache cleanly
const VERSION = '__VERSION__';
const SHELL = __SHELL__;
const CATALOG = 'https://mercurious.github.io/portmart-catalog/catalog.json';
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = 'data-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, cacheName, key = req) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range') || req.destination === 'video') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') e.respondWith(networkFirst(req, SHELL_CACHE, '/index.html'));
    else e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }
  if (url.href.split('?')[0] === CATALOG) e.respondWith(networkFirst(req, DATA_CACHE, CATALOG));
  else if (req.destination === 'image') e.respondWith(cacheFirst(req, DATA_CACHE));
});
