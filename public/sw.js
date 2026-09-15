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

// Interação com a notificação (botões de ação no Smartwatch/Barra de notificações ou clique no corpo)
self.addEventListener('notificationclick', (event) => {
  const action = event.action;

  // Fechar a notificação clicada imediatamente para não travar na barra ou no relógio
  event.notification.close();

  // Se o usuário clicou em um botão de ação direto do relógio ou barra (ex: 'complete_set', 'skip_rest', 'add_30s')
  if (action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        if (clientList && clientList.length > 0) {
          clientList.forEach((client) => {
            client.postMessage({
              type: 'WORKOUT_NOTIFICATION_ACTION',
              action: action,
              timestamp: Date.now()
            });
          });
        }
      })
    );
    return;
  }

  // Se clicou no corpo da notificação, fecha e traz o aplicativo para o primeiro plano
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

// Suporte a mensagens enviadas pelo app
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SHOW_TIMER_NOTIFICATION') {
    const title = event.data.title || '⏱️ Descanso Concluído!';
    const options = {
      body: event.data.body || 'Hora da próxima série! Mantenha o foco.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [350, 150, 350, 150, 500],
      tag: 'workout-timer',
      renotify: true,
      requireInteraction: true,
      silent: false,
      data: event.data.data || { url: '/' }
    };
    self.registration.showNotification(title, options);
  }

  if (event.data.type === 'CLOSE_WORKOUT_NOTIFICATIONS') {
    const tag = event.data.tag || 'workout-interactive-tracker';
    self.registration.getNotifications({ tag }).then((notifications) => {
      notifications.forEach((n) => n.close());
    });
  }
});