// Service Worker for LifeFlow push notifications
// Handles background notifications + offline support

const CACHE_VERSION = 'v4-' + '20260325';
const CACHE_NAME = `lifeflow-${CACHE_VERSION}`;

const urlsToCache = [
  '/'
];

// Install: Cache critical assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache).catch(err => {
        console.log('Cache addAll error:', err);
      });
    }).then(() => {
      // Notify clients that an update is available instead of forcing skipWaiting
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'sw-update-available' }));
      });
    })
  );
});

// Activate: Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first with cache fallback
self.addEventListener('fetch', event => {
  const { request } = event;

  // Skip cross-origin requests (Google Fonts, CDN) — never cache externally-hosted fonts
  // because Google Fonts CSS contains time-limited font binary URLs that expire.
  if (!request.url.startsWith(self.location.origin)) {
    return; // let browser handle it normally
  }

  // API calls: always go straight to the network — never cache dynamic data
  // For write operations, notify client if offline so mutations can be queued
  if (request.url.includes('/api/')) {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
      const clonedReq = request.clone();
      event.respondWith(
        clonedReq.text().catch(() => null).then(bodyText =>
          fetch(request).catch(() => {
            // Notify client about the failed mutation for offline queueing
            self.clients.matchAll().then(cls => {
              cls.forEach(c => c.postMessage({
                type: 'mutation-failed',
                method: request.method,
                url: request.url,
                body: bodyText
              }));
            });
            return new Response(JSON.stringify({ error: 'Offline — mutation queued' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          })
        )
      );
    }
    return; // GET requests pass through normally
  }

  // Local static assets: network-first so updates are always picked up,
  // fall back to cache only when offline
  else {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clonedResponse = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            if (cached) return cached;
            if (request.destination === 'document') {
              return caches.match('/');
            }
          });
        })
    );
  }
});

// Handle push notifications from server
self.addEventListener('push', event => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'LifeFlow notification',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: data.tag || 'lifeflow-notification',
      requireInteraction: data.requireInteraction || false,
      data: { taskId: data.taskId, url: sanitizePushUrl(data.url) }
    };
    
    event.waitUntil(self.registration.showNotification(data.title, options));
  } catch (err) {
    console.error('Push event error:', err);
  }
});

// Validate push notification URLs — only allow relative paths or same-origin
function sanitizePushUrl(url) {
  if (!url || typeof url !== 'string') return '/';
  // Only allow relative paths starting with /
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url, self.location.origin);
    if (parsed.origin === self.location.origin) return parsed.pathname + parsed.search;
  } catch(e) {}
  return '/';
}

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const url = sanitizePushUrl(event.notification.data?.url);
  const taskId = event.notification.data?.taskId;
  
  // Focus existing window or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // Check if LifeFlow is open
      const lifeflowClient = clientList.find(client => {
        return client.url.includes(self.location.origin);
      });
      
      if (lifeflowClient) {
        // Post message to open task detail (if taskId provided)
        if (taskId) {
          lifeflowClient.postMessage({ action: 'openTask', taskId });
        }
        return lifeflowClient.focus();
      } else {
        // Open in new window/tab
        return clients.openWindow(url);
      }
    })
  );
});

// Periodic sync (for badge/reminder updates when app is closed)
self.addEventListener('sync', event => {
  if (event.tag === 'lifeflow-sync-reminders') {
    event.waitUntil(syncReminders());
  }
});

async function syncReminders() {
  try {
    const response = await fetch('/api/reminders');
    const data = await response.json();
    
    // If user granted permission, show notification for overdue + today
    const count = (data.overdue?.length || 0) + (data.today?.length || 0);
    if (count > 0) {
      await self.registration.showNotification('LifeFlow Reminders', {
        body: `${count} task${count > 1 ? 's' : ''} due`,
        icon: '/favicon.ico',
        tag: 'lifeflow-sync',
        requireInteraction: false,
        data: { url: '/' }
      });
    }
  } catch (err) {
    console.error('Sync reminders error:', err);
  }
}

// Handle messages from main app (e.g., request to show notification)
self.addEventListener('message', event => {
  if (event.data?.type === 'skip-waiting') {
    self.skipWaiting();
  } else if (event.data?.type === 'show-notification') {
    const { notification } = event.data;
    if (notification) {
      self.registration.showNotification(notification.title, {
        body: notification.body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: notification.tag || 'lifeflow-notification',
        requireInteraction: false,
        data: { url: '/' }
      }).catch(err => {
        console.error('Error showing notification:', err);
      });
    }
  }
});
