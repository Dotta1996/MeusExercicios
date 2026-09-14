const CACHE_NAME = 'meusex-v1.3.0';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through Firestore and Auth requests
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('identitytoolkit.googleapis.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Abertura/foco no app ao clicar na notificação da barra do celular
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Suporte a mensagens do app para exibir notificação direta ou agendada
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_TIMER_NOTIFICATION') {
    const title = event.data.title || '⏱️ Descanso Concluído!';
    const options = {
      body: event.data.body || 'Hora da próxima série! Mantenha o foco.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [300, 150, 300, 150, 450],
      tag: 'workout-timer',
      renotify: true,
      requireInteraction: true,
      silent: false,
      data: event.data.data || { url: '/' }
    };
    self.registration.showNotification(title, options);
  }
});