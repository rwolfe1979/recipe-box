/* Recipe Box service worker: cache the app shell for offline use,
   always try the network first for data files. */

const VERSION = 'rb-v11';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/store.js',
  'js/shopping.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Share-target launches carry query params — serve the shell.
  if (url.origin === location.origin && url.searchParams.has('share-target')) {
    return; // let the page load normally; app JS handles the params
  }

  // Data and GitHub API: network first, fall back to cache.
  if (url.pathname.includes('/data/') || url.hostname === 'api.github.com') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (url.origin === location.origin && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(stripQuery(e.request), copy));
          }
          return res;
        })
        .catch(() => caches.match(stripQuery(e.request)))
    );
    return;
  }

  // Photos: cache first (they don't change), fall back to network.
  if (url.origin === location.origin && url.pathname.includes('/images/')) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      }))
    );
    return;
  }

  // App shell (html/css/js): network first so code updates show up immediately,
  // fall back to cache when offline.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
  }
});

function stripQuery(request) {
  const u = new URL(request.url);
  u.search = '';
  return new Request(u.toString());
}
