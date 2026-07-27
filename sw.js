const CACHE_NAME = 'weight-loss-tracker-v1';
const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// CDN resources to cache for offline Chart.js usage
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        const staticPromise = cache.addAll(STATIC_ASSETS);
        const cdnPromise = cache.addAll(CDN_ASSETS);
        return Promise.all([staticPromise, cdnPromise]);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error('[SW] Cache install failed:', err);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Navigation requests: cache-first, fallback to network, then fallback page
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html')
        .then((cached) => cached || fetch(request))
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for same-origin static assets and CDN Chart.js
  const isStaticSameOrigin = url.origin === self.location.origin &&
    (request.destination === 'image' ||
     request.destination === 'manifest' ||
     request.destination === 'document' ||
     request.destination === 'script' ||
     request.destination === 'style');
  const isCdnChart = url.href === 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';

  if (isStaticSameOrigin || isCdnChart) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request)
            .then((networkResponse) => {
              if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && !isCdnChart) {
                return networkResponse;
              }
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(request, responseClone));
              return networkResponse;
            })
            .catch(() => cachedResponse);
        })
    );
    return;
  }

  // Default: network first, fallback to cache
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
  );
});
