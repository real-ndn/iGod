// God's Eye service worker: the app shell works offline, and the 3D engine and fonts are kept after the first visit.
const SHELL = 'ge-shell-v3', LIBS = 'ge-libs-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== LIBS).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
const LIB_HOSTS = ['cesium.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com', 'cdn.jsdelivr.net'];
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (req.headers.has('range') || /\.(mp4|m4v|mov)$/i.test(u.pathname)) return; // video streams in byte ranges; the browser handles those best
  if (u.origin === location.origin) {
    // network first so new builds and refreshed live data win; cache is the offline fallback.
    // The page itself is revalidated every time (a cheap 304 when unchanged), so an update shows on the next open.
    const live = req.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('.html') ? fetch(u.href, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req);
    e.respondWith(live.then((r) => { if (r.ok && !u.pathname.includes('/data/')) { const cp = r.clone(); caches.open(SHELL).then((c) => c.put(req, cp)); } return r; })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
    return;
  }
  if (LIB_HOSTS.includes(u.host)) {
    e.respondWith(caches.open(LIBS).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; })));
  }
});
