// Service Worker for LifeFlow push notifications
// Handles background notifications + offline support

const CACHE_VERSION = 'v1';
const CACHE_NAME = `lifeflow-${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  '/public/index.html',
  '/favicon.ico'
];

// Install: Cache critical assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache).catch(err => {
        console.log('Cache addAll error:', err);
      });
    }).then(() => self.skipWaiting())
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
  
  // API calls: network-first
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clonedResponse);
          });
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
  
  // Static assets: cache-first
  else {
    event.respondWith(
      caches.match(request)
        .then(response => response || fetch(request))
        .catch(() => {
          if (request.destination === 'document') {
            return caches.match('/public/index.html');
          }
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
      data: { taskId: data.taskId, url: data.url || '/' }
    };
    
    event.waitUntil(self.registration.showNotification(data.title, options));
  } catch (err) {
    console.error('Push event error:', err);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const url = event.notification.data?.url || '/';
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
  if (event.data?.type === 'show-notification') {
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
