const CACHE_NAME = 'meusex-v1.4.0';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png'
];

// Estado do cronômetro em segundo plano dentro do Service Worker
let activeTimerTarget = null;
let activeTimerData = null;
let timerIntervalId = null;

const clearActiveTimer = () => {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  activeTimerTarget = null;
  activeTimerData = null;
};

const renderTimerNotification = async () => {
  if (!activeTimerTarget || !activeTimerData) {
    clearActiveTimer();
    return;
  }

  const now = Date.now();
  const remainingMs = activeTimerTarget - now;
  const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
  const { exName, currentSerieNum, totalSeries, currentPeso, currentReps, targetSlotIdx, targetSerieIdx } = activeTimerData;

  if (remainingSecs > 0) {
    const mins = Math.floor(remainingSecs / 60);
    const secs = (remainingSecs % 60).toString().padStart(2, '0');

    await self.registration.showNotification(`⏱️ Descanso: ${mins}:${secs} • ${exName}`, {
      body: `Próx: Série ${currentSerieNum}/${totalSeries} (${currentPeso}kg • ${currentReps} reps)`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'workout-interactive-tracker',
      renotify: false,
      silent: true,
      actions: [
        { action: 'skip_rest', title: '⏩ Pular' },
        { action: 'add_30s', title: '➕ +30s' }
      ]
    });
  } else {
    // Cronômetro zerou! Notificação com vibração forte e chamada para a próxima série
    clearActiveTimer();

    await self.registration.showNotification(`🔔 Hora da Série ${currentSerieNum}/${totalSeries}!`, {
      body: `${exName}: ${currentReps} reps com ${currentPeso}kg • Toque para concluir`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'workout-interactive-tracker',
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 200, 400, 200, 800],
      actions: [
        { action: `complete_set_${targetSlotIdx}_${targetSerieIdx}`, title: `✅ Concluir Série ${currentSerieNum}` },
        { action: 'add_30s', title: '⏱️ +30s' }
      ]
    });

    // Notificar a janela aberta do app (se acordada)
    notifyClient({
      type: 'WORKOUT_TIMER_DONE',
      timestamp: Date.now()
    });
  }
};

const notifyClient = (payload) => {
  clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    if (clientList && clientList.length > 0) {
      // Priorizar a janela focada/visível para evitar ações duplicadas
      const activeClient = clientList.find(c => c.visibilityState === 'visible') || clientList[0];
      if (activeClient) {
        activeClient.postMessage(payload);
      }
    }
  });
};

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

  // Tratamento de botões de ação direto do relógio ou barra
  if (action) {
    if (action === 'add_30s') {
      if (activeTimerTarget) {
        activeTimerTarget += 30000;
        renderTimerNotification();
      }
      notifyClient({
        type: 'WORKOUT_NOTIFICATION_ACTION',
        action: 'add_30s',
        timestamp: Date.now()
      });
      return;
    }

    if (action === 'skip_rest') {
      if (activeTimerData) {
        // Pular descanso imediatamente
        const data = { ...activeTimerData };
        clearActiveTimer();
        self.registration.showNotification(`🔔 Hora da Série ${data.currentSerieNum}/${data.totalSeries}!`, {
          body: `${data.exName}: ${data.currentReps} reps com ${data.currentPeso}kg • Toque para concluir`,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'workout-interactive-tracker',
          renotify: true,
          requireInteraction: true,
          vibrate: [350, 150, 350, 150, 500],
          actions: [
            { action: `complete_set_${data.targetSlotIdx}_${data.targetSerieIdx}`, title: `✅ Concluir Série ${data.currentSerieNum}` },
            { action: 'add_30s', title: '⏱️ +30s' }
          ]
        });
      }
      notifyClient({
        type: 'WORKOUT_NOTIFICATION_ACTION',
        action: 'skip_rest',
        timestamp: Date.now()
      });
      return;
    }

    // Se concluiu uma série ou finalizou o treino
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        if (clientList && clientList.length > 0) {
          const activeClient = clientList.find(c => c.visibilityState === 'visible') || clientList[0];
          if (activeClient) {
            activeClient.postMessage({
              type: 'WORKOUT_NOTIFICATION_ACTION',
              action: action,
              timestamp: Date.now()
            });
          }
        }
      })
    );
    return;
  }

  // Se clicou no corpo da notificação, traz o aplicativo para o primeiro plano
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

  // Iniciar contagem do timer com atualização segundo a segundo na notificação
  if (event.data.type === 'START_TIMER_COUNTDOWN') {
    clearActiveTimer();
    activeTimerTarget = event.data.targetEndTime;
    activeTimerData = {
      exName: event.data.exName || 'Exercício',
      currentSerieNum: event.data.currentSerieNum || 1,
      totalSeries: event.data.totalSeries || 1,
      currentPeso: event.data.currentPeso ?? 0,
      currentReps: event.data.currentReps ?? 10,
      targetSlotIdx: event.data.targetSlotIdx ?? 0,
      targetSerieIdx: event.data.targetSerieIdx ?? 0
    };

    renderTimerNotification();
    timerIntervalId = setInterval(renderTimerNotification, 1000);
    return;
  }

  // Parar timer
  if (event.data.type === 'STOP_TIMER_COUNTDOWN') {
    clearActiveTimer();
    return;
  }

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
    clearActiveTimer();
    const tag = event.data.tag || 'workout-interactive-tracker';
    self.registration.getNotifications({ tag }).then((notifications) => {
      notifications.forEach((n) => n.close());
    });
  }
});