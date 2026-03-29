/* ============================================================
   VEIL & VENTURE — Service Worker
   Versi cache: v1 — perbarui string ini tiap ada update besar
   ============================================================ */

const CACHE_NAME = 'veil-venture-v1';

/* File-file yang di-cache saat instalasi (pre-cache) */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.json'
];

/* ── Install: cache semua aset utama ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

/* ── Activate: hapus cache lama ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: Cache-first untuk aset lokal, network-first untuk lainnya ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Lewati request non-GET */
  if (event.request.method !== 'GET') return;

  /* Aset lokal: cache-first */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          /* Cache respons segar */
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          /* Offline fallback: kembalikan index.html */
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  /* Request eksternal (font Google, dll): network-first dengan fallback cache */
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
