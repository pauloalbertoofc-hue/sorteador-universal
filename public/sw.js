const CACHE = 'sorteador-universal-v2-3-02';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
const STATIC_PATHS = new Set(PRECACHE.map(path => new URL(path, self.location.href).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(PRECACHE))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  // Remove previous caches, including anonymous or authenticated API responses.
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(key => key.startsWith('sorteador-universal-') && key !== CACHE)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Account state must always reach the server, even offline or with an old cache.
  // Cache Storage ignores Cache-Control: no-store unless we enforce it ourselves.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req, {cache: 'no-store'}));
    return;
  }
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put('./index.html', copy)));
      }
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  if (!STATIC_PATHS.has(url.pathname)) return;
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(response => {
    if (response.ok && !/no-store/i.test(response.headers.get('cache-control') || '')) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(req, copy)));
    }
    return response;
  })));
});
