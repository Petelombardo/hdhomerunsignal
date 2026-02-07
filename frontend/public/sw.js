const CACHE_NAME = 'hdhr-monitor-v3';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache resources and skip waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.log('Cache addAll failed:', error);
      })
  );
});

// Fetch event - network-first for HTML, cache-first for assets
self.addEventListener('fetch', (event) => {
  // Skip caching for API calls, WebSocket connections, and version files
  if (event.request.url.includes('/api/') ||
      event.request.url.includes('/socket.io/') ||
      event.request.url.includes('build-version.json') ||
      event.request.method !== 'GET') {
    return;
  }

  // Network-first for HTML documents (navigation requests)
  // This ensures we always get the latest index.html with correct JS references
  if (event.request.mode === 'navigate' ||
      event.request.destination === 'document' ||
      event.request.url.endsWith('/') ||
      event.request.url.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the fresh HTML for offline fallback
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Offline - try to serve from cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, images)
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        // Not in cache - fetch and cache it
        return fetch(event.request).then((fetchResponse) => {
          // Only cache successful responses for static assets
          if (fetchResponse.ok && event.request.url.match(/\.(js|css|png|jpg|ico|woff2?)$/)) {
            const responseClone = fetchResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return fetchResponse;
        });
      })
  );
});

// Activate event - cleanup old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Claim all clients so new SW takes effect immediately
      return self.clients.claim();
    })
  );
});