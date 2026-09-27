const CACHE_NAME = 'meusex-v2.5.0';
// Importante: NÃO incluir '/' nem '/index.html' aqui. Esses arquivos mudam a cada
// build (referenciam o bundle JS com hash novo) e, se ficarem em cache "para sempre",
// o app passa a rodar código antigo mesmo depois de reinstalar um APK mais novo — foi
// exatamente isso que causou telas/correções "sumidas" depois de builds anteriores.
// Eles são tratados como network-first no handler de 'fetch' abaixo.
const ASSETS_TO_CACHE = [
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

  try {
    const bc = new BroadcastChannel('workout_sync_channel');
    bc.postMessage(payload);
    bc.close();
  } catch (e) {}
};

// Pede pra aba do app agendar o alarme de descanso via LocalNotifications
// (AlarmManager nativo do Android) — o Service Worker não tem acesso direto
// aos plugins nativos do Capacitor, só a aba (contexto da janela) tem.
const triggerNativeTimer = async (seconds, label) => {
  try {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (clientList && clientList.length > 0) {
      clientList.forEach(client => {
        try {
          client.postMessage({ type: 'SCHEDULE_REST_ALARM', seconds, label });
        } catch (e) {}
      });
    }
    // Sem nenhuma aba/instância do app aberta (ação disparada só pelo relógio,
    // app totalmente fechado): não há como agendar o alarme nativo neste caso.
  } catch (e) {
    console.warn('Erro ao acionar o alarme de descanso:', e);
  }
};

// --- PROCESSAR CONCLUSÃO DE SÉRIE DIRETO NO SERVICE WORKER (EM SEGUNDO PLANO) ---
async function handleCompleteSetInSW(slotIdx, serieIdx) {
  let session = await getStoredSession();
  if (!session || !session.treino || !session.execucaoData) {
    console.warn('[SW] Sessão não encontrada no IndexedDB');
    return;
  }

  const { treino, execucaoData } = session;
  
  // Resolução segura do slotIdx (trata NaN, undefined ou fora dos limites)
  let targetSlotIdx = (slotIdx !== undefined && !isNaN(slotIdx) && slotIdx >= 0 && slotIdx < treino.listaExercicios.length)
    ? slotIdx
    : (session.activeSlotIndex !== undefined && !isNaN(session.activeSlotIndex) ? session.activeSlotIndex : 0);

  const isSlotIncomplete = (sIdx) => {
    const sl = treino.listaExercicios[sIdx];
    if (!sl) return false;
    const sIds = typeof sl === 'string' ? [sl] : sl.ids;
    return !sIds.every(id => execucaoData[`${sIdx}-${id}`]?.concluido);
  };

  // Se o slot indicado já estiver concluído ou inexistente, encontra o primeiro com pendências
  if (!isSlotIncomplete(targetSlotIdx)) {
    const firstPendingSlot = treino.listaExercicios.findIndex((_, idx) => isSlotIncomplete(idx));
    if (firstPendingSlot !== -1) {
      targetSlotIdx = firstPendingSlot;
    }
  }

  let slot = treino.listaExercicios[targetSlotIdx];
  if (!slot) return;
  let ids = typeof slot === 'string' ? [slot] : slot.ids;
  let firstId = ids[0];

  // Identificar com precisão qual série marcar como concluída
  const firstSlotSeries = execucaoData[`${targetSlotIdx}-${firstId}`]?.series || [];
  let targetSerieIdx = serieIdx;

  // Se a série passada for inválida, já estiver concluída ou fora dos limites, busca a primeira pendente no slot
  if (targetSerieIdx === undefined || isNaN(targetSerieIdx) || targetSerieIdx < 0 || targetSerieIdx >= firstSlotSeries.length || firstSlotSeries[targetSerieIdx]?.concluida) {
    const pendingIdx = firstSlotSeries.findIndex(s => !s.concluida);
    if (pendingIdx !== -1) {
      targetSerieIdx = pendingIdx;
    }
  }

  if (targetSerieIdx !== -1) {
    // Marcar a série como concluída para todos os exercícios deste slot
    ids.forEach(exId => {
      const key = `${targetSlotIdx}-${exId}`;
      if (execucaoData[key] && execucaoData[key].series && execucaoData[key].series[targetSerieIdx]) {
        execucaoData[key].series[targetSerieIdx].concluida = true;
      }
    });
  }

  // Checar se todas as séries deste slot foram concluídas
  const allSeriesInSlotDone = ids.every(id => {
    const s = execucaoData[`${targetSlotIdx}-${id}`]?.series;
    return s && s.every(item => item.concluida);
  });

  if (allSeriesInSlotDone) {
    ids.forEach(id => {
      const key = `${targetSlotIdx}-${id}`;
      if (execucaoData[key]) execucaoData[key].concluido = true;
    });
  }

  // Localizar a próxima série pendente e o tempo configurado do exercício
  let nextSlotIdx = targetSlotIdx;
  let nextSerieIdx = -1;
  let nextExName = '';
  let nextPeso = 0;
  let nextReps = 10;
  let totalSeries = 1;
  let timerDuration = 60;
  let timerEnabled = true;

  // 1. Verificar se ainda há série pendente no mesmo slot
  const currentSlotSeries = execucaoData[`${targetSlotIdx}-${firstId}`]?.series || [];
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
  session.activeSlotIndex = nextSlotIdx !== -1 ? nextSlotIdx : targetSlotIdx;
  session.execucaoData = execucaoData;
  session.lastUpdated = Date.now();

  if (nextSlotIdx === -1) {
    // Treino 100% finalizado
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

  // Se o exercício tem timer ativo, guarda o alvo (para o widget da aba se recuperar
  // ao voltar) e aciona o alarme confiável no app nativo de Timer do Android.
  if (timerEnabled) {
    const targetEnd = Date.now() + timerDuration * 1000;
    session.activeTimer = {
      targetEndTime: targetEnd,
      duration: timerDuration,
      timerDuration: timerDuration,
      slotIndex: nextSlotIdx,
      targetSlotIdx: nextSlotIdx,
      serieIndex: nextSerieIdx,
      targetSerieIdx: nextSerieIdx
    };
  } else {
    session.activeTimer = null;
  }
  await saveStoredSession(session);
  notifyClients({ type: 'WORKOUT_STATE_UPDATED', session });

  // Mostra imediatamente a notificação acionável com a próxima série — não
  // depende de nenhuma contagem em segundo plano para aparecer.
  await self.registration.showNotification(`🔔 Série ${nextSerieIdx + 1}/${totalSeries} • ${nextExName}`, {
    body: `${nextReps} reps • ${nextPeso}kg | Toque abaixo ao concluir`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "workout-interactive-tracker",
    renotify: true,
    actions: [
      { action: `complete_set_${nextSlotIdx}_${nextSerieIdx}`, title: `✅ Concluir Série ${nextSerieIdx + 1}` }
    ]
  });

  if (timerEnabled) {
    await triggerNativeTimer(timerDuration, nextExName);
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

  // Navegação (a própria página) e o index.html: sempre busca a versão mais nova
  // primeiro. Só cai pro cache se estiver genuinamente offline. Isso garante que
  // builds novos (novas telas, correções) apareçam assim que o app é reinstalado/
  // atualizado, em vez de ficar preso numa versão antiga em cache.
  if (event.request.mode === 'navigate' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
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
  let action = event.action;
  const notifData = event.notification.data || {};

  // Fechar a notificação para que a nova tome o lugar
  event.notification.close();

  // Se clicou no corpo da notificação de "Hora da Série", conclui a série!
  if (!action && notifData.type === 'complete_set') {
    action = `complete_set_${notifData.slotIdx}_${notifData.serieIdx}`;
  }

  // 1. Concluir Série (complete_set_slot_serie)
  if (action && action.startsWith('complete_set')) {
    const parts = action.split('_');
    const slotIdx = parseInt(parts[2], 10);
    const serieIdx = parseInt(parts[3], 10);

    event.waitUntil(handleCompleteSetInSW(slotIdx, serieIdx));
    return;
  }

  // 2. Finalizar Treino
  if (action === 'finish_workout') {
    notifyClients({ type: 'WORKOUT_NOTIFICATION_ACTION', action: 'finish_workout', timestamp: Date.now() });
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

  // Se clicou no corpo de outra notificação genérica: foca ou abre a aba do treino
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

  // 0. Pular espera e assumir controle imediatamente
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // 1. Sincronizar o estado completo da sessão ativa
  if (event.data.type === 'SYNC_WORKOUT_STATE') {
    if (event.data.session) {
      saveStoredSession(event.data.session);
    }
    return;
  }

  // 2. Limpeza total ao encerrar o treino
  if (event.data.type === 'CLEAR_WORKOUT_SESSION') {
    clearStoredSession();
    return;
  }
});
