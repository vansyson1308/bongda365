// BongDa365 Service Worker - Offline support & caching
const CACHE_NAME = 'bongda365-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/config.js',
  '/api.js',
  '/router.js',
  '/favourites.js',
  '/sidebar.js',
  '/chat.js',
  '/push-notifications.js',
  '/app.js',
];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and Socket.io
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/socket.io/')) return;

  // API requests: network only (real-time data)
  if (url.pathname.startsWith('/api/')) return;

  // Static assets: cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ── Push Notifications ──

// Listen for push events from server
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      matchId: data.matchId,
    },
    actions: data.actions || [],
    tag: data.tag || 'default',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'BongDa365', options)
  );
});

// Handle notification click — focus existing window or open new
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};
  let url = data.url || '/';

  // Handle action buttons
  if (action === 'view' && data.matchId) {
    url = `/#/match/${data.matchId}`;
  } else if (action === 'predict' && data.matchId) {
    url = `/#/match/${data.matchId}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (const client of windowClients) {
        if ('focus' in client) {
          return client.focus().then(c => c.navigate(url));
        }
      }
      return clients.openWindow(url);
    })
  );
});
