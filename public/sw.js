const CACHE_NAME = 'meusex-v1.5.1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png'
];

// --- GERENCIAMENTO DE PERSISTÊNCIA EM INDEXEDDB (COMPATÍVEL COM SERVICE WORKER) ---
const DB_NAME = 'meus_exercicios_live';
const DB_VERSION = 1;
const STORE_NAME = 'session';
const SESSION_KEY = 'current_workout';

function openWorkoutDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getStoredSession() {
  return openWorkoutDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SESSION_KEY);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  }).catch(() => null);
}

function saveStoredSession(data) {
  return openWorkoutDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ key: SESSION_KEY, data: data, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }).catch(() => false);
}

function clearStoredSession() {
  return openWorkoutDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(SESSION_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }).catch(() => false);
}

// --- ESTADO DO CRONÔMETRO NO SERVICE WORKER ---
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

const notifyClients = (payload) => {
  clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    if (clientList && clientList.length > 0) {
      clientList.forEach(client => {
        try {
          client.postMessage(payload);
        } catch (e) {
          console.warn('Erro ao postar mensagem para cliente:', e);
        }
      });
    }
  });
};

// Renderizar notificação de descanso durante a contagem regressiva
const renderTimerNotification = async (remainingSecs) => {
  if (!activeTimerData) return;
  const { exName, currentSerieNum, totalSeries, currentPeso, currentReps, timerDuration } = activeTimerData;
  const mins = Math.floor(remainingSecs / 60);
  const secs = (remainingSecs % 60).toString().padStart(2, '0');
  const durLabel = timerDuration ? `${timerDuration}s` : 'Tempo';

  try {
    await self.registration.showNotification(`⏱️ Descanso: ${mins}:${secs} • ${exName}`, {
      body: `Próx: Série ${currentSerieNum}/${totalSeries} (${currentPeso}kg • ${currentReps} reps)`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'workout-interactive-tracker',
      renotify: false,
      silent: true,
      actions: [
        { action: 'skip_rest', title: '⏩ Pular' },
        { action: 'repeat_rest', title: `➕ +${durLabel}` }
      ]
    });
  } catch (err) {
    console.warn('Erro ao atualizar notificação de descanso:', err);
  }
};

// Disparo ao zerar o tempo: notificação chamando para a série com vibração
const handleTimerZero = async () => {
  const data = activeTimerData ? { ...activeTimerData } : null;
  clearActiveTimer();

  if (!data) return;
  const { exName, currentSerieNum, totalSeries, currentPeso, currentReps, targetSlotIdx, targetSerieIdx, timerDuration } = data;
  const durLabel = timerDuration ? `${timerDuration}s` : 'Tempo';

  try {
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
        { action: 'repeat_rest', title: `⏱️ +${durLabel}` }
      ]
    });
  } catch (err) {
    console.warn('Erro ao disparar notificação de término do descanso:', err);
  }

  notifyClients({
    type: 'WORKOUT_TIMER_DONE',
    timestamp: Date.now()
  });
};

// Loop do cronômetro: checa a cada segundo, mas só atualiza notificação a cada 5s
// para evitar que o Android ou relógios Wear OS congelem ou descartem notificações
const tickSWTimer = async () => {
  if (!activeTimerTarget || !activeTimerData) {
    clearActiveTimer();
    return;
  }
  const now = Date.now();
  const remainingMs = activeTimerTarget - now;
  const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));

  if (remainingSecs <= 0) {
    await handleTimerZero();
    return;
  }

  const lastRender = activeTimerData.lastRenderTime || 0;
  // Atualiza no início, a cada 5 segundos, e a cada segundo nos últimos 5 segundos
  const shouldRender = (now - lastRender >= 5000) || (remainingSecs <= 5);

  if (shouldRender) {
    activeTimerData.lastRenderTime = now;
    await renderTimerNotification(remainingSecs);
  }
};

const startSWTimer = (timerInfo) => {
  clearActiveTimer();
  activeTimerTarget = timerInfo.targetEndTime;
  activeTimerData = {
    ...timerInfo,
    lastRenderTime: 0
  };

  const remainingMs = activeTimerTarget - Date.now();
  const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
  renderTimerNotification(remainingSecs);

  timerIntervalId = setInterval(tickSWTimer, 1000);
};

// --- PROCESSAR CONCLUSÃO DE SÉRIE DIRETO NO SERVICE WORKER (EM SEGUNDO PLANO) ---
async function handleCompleteSetInSW(slotIdx, serieIdx) {
  let session = await getStoredSession();
  if (!session || !session.treino || !session.execucaoData) return;

  const { treino, execucaoData } = session;
  const slot = treino.listaExercicios[slotIdx];
  if (!slot) return;
  const ids = typeof slot === 'string' ? [slot] : slot.ids;

  // Marcar a série como concluída para todos os exercícios deste slot
  ids.forEach(exId => {
    const key = `${slotIdx}-${exId}`;
    if (execucaoData[key] && execucaoData[key].series && execucaoData[key].series[serieIdx]) {
      execucaoData[key].series[serieIdx].concluida = true;
    }
  });

  // Checar se todas as séries deste slot foram concluídas
  const firstId = ids[0];
  const allSeriesInSlotDone = ids.every(id => {
    const s = execucaoData[`${slotIdx}-${id}`]?.series;
    return s && s.every(item => item.concluida);
  });

  if (allSeriesInSlotDone) {
    ids.forEach(id => {
      const key = `${slotIdx}-${id}`;
      if (execucaoData[key]) execucaoData[key].concluido = true;
    });
  }

  // Localizar a próxima série pendente e o tempo configurado do exercício
  let nextSlotIdx = slotIdx;
  let nextSerieIdx = -1;
  let nextExName = '';
  let nextPeso = 0;
  let nextReps = 10;
  let totalSeries = 1;
  let timerDuration = 60;
  let timerEnabled = true;

  // 1. Verificar se ainda há série pendente no mesmo slot
  const currentSlotSeries = execucaoData[`${slotIdx}-${firstId}`]?.series || [];
  const nextInSlot = currentSlotSeries.findIndex(s => !s.concluida);

  if (nextInSlot !== -1) {
    nextSerieIdx = nextInSlot;
    nextExName = ids.map(id => session.allExs?.[id]?.nome || 'Exercício').join(' / ');
    nextPeso = currentSlotSeries[nextInSlot]?.peso || 0;
    nextReps = currentSlotSeries[nextInSlot]?.reps || 10;
    totalSeries = currentSlotSeries.length;
    
    // Obter o timer do exercício atual
    const exObj = session.allExs?.[firstId];
    if (exObj) {
      const parsedDur = Number(exObj.timerPadrao);
      timerDuration = !isNaN(parsedDur) && parsedDur > 0 ? Math.round(parsedDur) : 60;
      timerEnabled = exObj.timerAtivo !== false;
    }
  } else {
    // 2. Slot atual foi concluído! Localizar o próximo slot incompleto do treino
    const nextSlot = treino.listaExercicios.findIndex((sl, idx) => {
      const sIds = typeof sl === 'string' ? [sl] : sl.ids;
      return !sIds.every(id => execucaoData[`${idx}-${id}`]?.concluido);
    });

    if (nextSlot !== -1) {
      nextSlotIdx = nextSlot;
      const sSlot = treino.listaExercicios[nextSlot];
      const sIds = typeof sSlot === 'string' ? [sSlot] : sSlot.ids;
      const sFirstId = sIds[0];
      const sSeries = execucaoData[`${nextSlot}-${sFirstId}`]?.series || [];
      const sPending = sSeries.findIndex(s => !s.concluida);
      nextSerieIdx = sPending !== -1 ? sPending : 0;
      nextExName = sIds.map(id => session.allExs?.[id]?.nome || 'Exercício').join(' / ');
      nextPeso = sSeries[nextSerieIdx]?.peso || 0;
      nextReps = sSeries[nextSerieIdx]?.reps || 10;
      totalSeries = sSeries.length || 1;

      // Obter o timer do novo exercício
      const exObj = session.allExs?.[sFirstId];
      if (exObj) {
        const parsedDur = Number(exObj.timerPadrao);
        timerDuration = !isNaN(parsedDur) && parsedDur > 0 ? Math.round(parsedDur) : 60;
        timerEnabled = exObj.timerAtivo !== false;
      }
    } else {
      // Treino inteiro foi concluído!
      nextSlotIdx = -1;
    }
  }

  // Atualizar sessão no IndexedDB
  session.activeSlotIndex = nextSlotIdx !== -1 ? nextSlotIdx : slotIdx;
  session.execucaoData = execucaoData;
  session.lastUpdated = Date.now();

  if (nextSlotIdx === -1) {
    // Treino 100% finalizado
    clearActiveTimer();
    session.activeTimer = null;
    await saveStoredSession(session);
    notifyClients({ type: 'WORKOUT_STATE_UPDATED', session });

    await self.registration.showNotification("🎉 Treino Concluído!", {
      body: "Todas as séries foram finalizadas! Toque para salvar e encerrar.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "workout-interactive-tracker",
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 200, 400, 200, 600],
      actions: [
        { action: 'finish_workout', title: '🏁 Finalizar Treino' }
      ]
    });
    return;
  }

  // Se o exercício tem timer ativo, inicia o cronômetro com o tempo exato configurado pelo usuário
  if (timerEnabled) {
    const targetEnd = Date.now() + timerDuration * 1000;
    const activeTimer = {
      targetEndTime: targetEnd,
      duration: timerDuration,
      slotIndex: nextSlotIdx,
      serieIndex: nextSerieIdx,
      exName: nextExName,
      currentSerieNum: nextSerieIdx + 1,
      totalSeries: totalSeries,
      currentPeso: nextPeso,
      currentReps: nextReps,
      timerDuration: timerDuration
    };
    session.activeTimer = activeTimer;
    await saveStoredSession(session);
    notifyClients({ type: 'WORKOUT_STATE_UPDATED', session });

    startSWTimer(activeTimer);
  } else {
    // Sem timer: exibe imediatamente a notificação da próxima série
    clearActiveTimer();
    session.activeTimer = null;
    await saveStoredSession(session);
    notifyClients({ type: 'WORKOUT_STATE_UPDATED', session });

    await self.registration.showNotification(`🏋️ ${nextExName} (${nextSerieIdx + 1}/${totalSeries})`, {
      body: `${nextReps} reps • ${nextPeso}kg | Toque abaixo ao concluir`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "workout-interactive-tracker",
      renotify: true,
      actions: [
        { action: `complete_set_${nextSlotIdx}_${nextSerieIdx}`, title: `✅ Concluir Série ${nextSerieIdx + 1}` }
      ]
    });
  }
}

// --- CICLO DE VIDA DO SERVICE WORKER ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
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
  // Ignora requisições que não sejam GET (ex: POST, PUT, DELETE) para evitar erro no Cache API
  if (event.request.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }

  // Não interceptar requisições externas, APIs do Google, Firebase, Firestore ou rotas de API
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('gstatic.com') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request);
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});

// --- CLIQUES EM NOTIFICAÇÕES (SMARTWATCH / LOCK SCREEN / BARRA) ---
self.addEventListener('notificationclick', (event) => {
  const action = event.action;

  // Fechar a notificação para que a nova tome o lugar
  event.notification.close();

  if (action) {
    // 1. Pular Descanso
    if (action === 'skip_rest') {
      event.waitUntil((async () => {
        const session = await getStoredSession();
        const data = activeTimerData || session?.activeTimer;
        clearActiveTimer();
        if (session) {
          session.activeTimer = null;
          await saveStoredSession(session);
        }

        if (data) {
          const durLabel = data.timerDuration ? `${data.timerDuration}s` : 'Tempo';
          await self.registration.showNotification(`🔔 Hora da Série ${data.currentSerieNum}/${data.totalSeries}!`, {
            body: `${data.exName}: ${data.currentReps} reps com ${data.currentPeso}kg • Toque para concluir`,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'workout-interactive-tracker',
            renotify: true,
            requireInteraction: true,
            vibrate: [350, 150, 350, 150, 500],
            actions: [
              { action: `complete_set_${data.targetSlotIdx}_${data.targetSerieIdx}`, title: `✅ Concluir Série ${data.currentSerieNum}` },
              { action: 'repeat_rest', title: `⏱️ +${durLabel}` }
            ]
          });
        }
        notifyClients({ type: 'WORKOUT_NOTIFICATION_ACTION', action: 'skip_rest', timestamp: Date.now() });
      })());
      return;
    }

    // 2. Repetir ou adicionar descanso com o tempo exato do exercício
    if (action === 'repeat_rest' || action === 'add_rest_time' || action === 'add_30s') {
      event.waitUntil((async () => {
        const session = await getStoredSession();
        const data = activeTimerData || session?.activeTimer;
        const dur = (data && data.timerDuration) ? data.timerDuration : 60;

        if (activeTimerTarget) {
          // Timer já ativo: adiciona o tempo do exercício
          activeTimerTarget += dur * 1000;
          if (activeTimerData) activeTimerData.targetEndTime = activeTimerTarget;
          if (session && session.activeTimer) {
            session.activeTimer.targetEndTime = activeTimerTarget;
            await saveStoredSession(session);
          }
          const remainingSecs = Math.max(0, Math.ceil((activeTimerTarget - Date.now()) / 1000));
          renderTimerNotification(remainingSecs);
        } else if (data) {
          // Timer estava zerado: inicia novo descanso com o tempo do exercício
          const targetEnd = Date.now() + dur * 1000;
          const newTimerInfo = {
            ...data,
            targetEndTime: targetEnd,
            duration: dur,
            timerDuration: dur
          };
          if (session) {
            session.activeTimer = newTimerInfo;
            await saveStoredSession(session);
          }
          startSWTimer(newTimerInfo);
        }
        notifyClients({ type: 'WORKOUT_NOTIFICATION_ACTION', action: 'repeat_rest', duration: dur, timestamp: Date.now() });
      })());
      return;
    }

    // 3. Concluir Série (complete_set_slot_serie)
    if (action.startsWith('complete_set')) {
      const parts = action.split('_');
      const slotIdx = parseInt(parts[2], 10);
      const serieIdx = parseInt(parts[3], 10);

      event.waitUntil(handleCompleteSetInSW(slotIdx, serieIdx));
      return;
    }

    // 4. Finalizar Treino
    if (action === 'finish_workout') {
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
          for (const client of clientList) {
            if ('focus' in client) return client.focus();
          }
          if (clients.openWindow) return clients.openWindow('/');
        })
      );
      return;
    }
  }

  // Se clicou no corpo da notificação: foca ou abre a aba do treino
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// --- MENSAGENS RECEBIDAS DA ABA DO APP ---
self.addEventListener('message', (event) => {
  if (!event.data) return;

  // 1. Sincronizar o estado completo da sessão ativa
  if (event.data.type === 'SYNC_WORKOUT_STATE') {
    if (event.data.session) {
      saveStoredSession(event.data.session);
    }
    return;
  }

  // 2. Iniciar cronômetro disparado pela aba
  if (event.data.type === 'START_TIMER_COUNTDOWN') {
    startSWTimer(event.data);
    return;
  }

  // 3. Parar cronômetro disparado pela aba
  if (event.data.type === 'STOP_TIMER_COUNTDOWN') {
    clearActiveTimer();
    return;
  }

  // 4. Limpeza total ao encerrar o treino
  if (event.data.type === 'CLEAR_WORKOUT_SESSION') {
    clearActiveTimer();
    clearStoredSession();
    return;
  }
});
