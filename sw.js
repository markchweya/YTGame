/* Service worker: caches the game shell so it runs offline after the first visit.
 * Bump CACHE when files change so old shells are dropped.
 */
const CACHE = 'neon-rush-v1';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/utils.js',
  './js/storage.js',
  './js/leaderboard.js',
  './js/audio.js',
  './js/input.js',
  './js/entities.js',
  './js/sprites.js',
  './js/renderer.js',
  './js/ui.js',
  './js/game.js',
  './js/main.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// network first for same-origin files (so updates land), cache fallback when offline
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
