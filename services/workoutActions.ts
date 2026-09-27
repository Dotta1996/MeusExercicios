// Ações de treino disparadas por botões de notificação nativa (relógio/barra/
// lockscreen), registradas UMA VEZ na raiz do app (App.tsx) — não dentro da tela
// de execução. Isso é essencial: se o app foi totalmente fechado (ex: tela do
// celular apagada por muito tempo) e o usuário toca "Concluir Série" na
// notificação, o Android reabre o app do zero, e a tela de execução pode levar
// um tempo pra montar (ou nem montar, dependendo da rota inicial) — um listener
// preso a essa tela específica corre o risco de nunca chegar a existir a tempo
// de processar o toque. Por isso essa lógica opera direto sobre a sessão
// persistida no IndexedDB (o mesmo dado que o Service Worker usa/usava), sem
// depender de nenhum componente React estar montado. Se a tela de execução
// estiver aberta, ela recebe a atualização em tempo real pelo BroadcastChannel
// que já escuta (handleRemoteSessionUpdate em ActiveWorkout.tsx).

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getStoredWorkoutSession, saveStoredWorkoutSession, StoredWorkoutSession } from './workoutSync';
import { Treino, Exercicio, ExercicioExecutado, TreinoSlot } from '../types';
import {
  ensureNativeNotificationsReady,
  buildStatusNotificationContent,
  fireRestStartNotifications,
  fireStatusNotification,
  cancelRestAlarmNotification,
  getSlotTimerInfo
} from './nativeNotifications';

const broadcastSessionUpdate = (session: StoredWorkoutSession) => {
  try {
    const bc = new BroadcastChannel('workout_sync_channel');
    bc.postMessage({ type: 'WORKOUT_STATE_UPDATED', session });
    bc.close();
  } catch (e) {}
};

const completeSerieInStoredSession = async (slotIndex: number, sIndex: number) => {
  const session = await getStoredWorkoutSession();
  if (!session || !session.treino || !session.execucaoData) return;
  const treino = session.treino as Treino;
  const allExs = (session.allExs || {}) as Record<string, Exercicio>;
  const execucaoData = session.execucaoData as Record<string, ExercicioExecutado>;

  const slot = treino.listaExercicios[slotIndex];
  if (!slot) return;
  const ids = typeof slot === 'string' ? [slot] : (slot as TreinoSlot).ids;
  const firstKey = `${slotIndex}-${ids[0]}`;
  if (!execucaoData[firstKey] || !execucaoData[firstKey].series) return;

  let targetIdx = sIndex;
  if (!execucaoData[firstKey].series[targetIdx] || execucaoData[firstKey].series[targetIdx].concluida) {
    const pendingIdx = execucaoData[firstKey].series.findIndex(s => !s.concluida);
    if (pendingIdx !== -1) {
      targetIdx = pendingIdx;
    } else {
      return; // Todas as séries já estão concluídas
    }
  }

  const { duration: timerDuration, enabled: shouldStartTimer } = getSlotTimerInfo(treino, allExs, slotIndex);

  const next = { ...execucaoData };
  ids.forEach(exId => {
    const key = `${slotIndex}-${exId}`;
    if (next[key]) {
      const newSeries = [...next[key].series];
      if (newSeries[targetIdx]) {
        newSeries[targetIdx] = { ...newSeries[targetIdx], concluida: true };
      }
      next[key] = { ...next[key], series: newSeries };
    }
  });

  const allSeriesDone = ids.every(id => next[`${slotIndex}-${id}`]?.series.every(s => s.concluida));
  let nextSlotIndex = slotIndex;
  if (allSeriesDone) {
    ids.forEach(id => {
      const key = `${slotIndex}-${id}`;
      next[key] = { ...next[key], concluido: true };
    });
    if (treino.listaExercicios[slotIndex + 1]) {
      nextSlotIndex = slotIndex + 1;
    }
  } else {
    ids.forEach(id => {
      const key = `${slotIndex}-${id}`;
      next[key] = { ...next[key], concluido: false };
    });
  }

  // Calculado uma única vez e gravado na sessão — se não fizer isso, a sessão
  // salva continua com o activeTimer do descanso ANTERIOR (já interrompido), e
  // aí a tela do app (se estiver aberta) recupera esse valor velho e mostra o
  // tempo restante errado pro próximo descanso.
  const targetEndTime = shouldStartTimer ? Date.now() + timerDuration * 1000 : null;

  const updatedSession: StoredWorkoutSession = {
    ...session,
    execucaoData: next,
    activeSlotIndex: nextSlotIndex,
    activeTimer: targetEndTime ? { targetEndTime, slotIndex: nextSlotIndex } : null,
    lastUpdated: Date.now()
  };
  await saveStoredWorkoutSession(updatedSession);
  broadcastSessionUpdate(updatedSession);

  const statusContent = buildStatusNotificationContent(treino, allExs, next, nextSlotIndex);
  const exName = statusContent?.kind === 'next-step' ? statusContent.exName : 'Descanso';

  if (targetEndTime) {
    await fireRestStartNotifications(targetEndTime, exName, statusContent);
  } else if (statusContent) {
    await fireStatusNotification(statusContent);
  }
};

const skipExercicioInStoredSession = async (slotIndex: number) => {
  const session = await getStoredWorkoutSession();
  if (!session || !session.treino || !session.execucaoData) return;
  const treino = session.treino as Treino;
  const allExs = (session.allExs || {}) as Record<string, Exercicio>;
  const execucaoData = session.execucaoData as Record<string, ExercicioExecutado>;
  const total = treino.listaExercicios.length;

  let nextIdx = -1;
  for (let offset = 1; offset <= total; offset++) {
    const idx = (slotIndex + offset) % total;
    if (idx === slotIndex) continue;
    const sl = treino.listaExercicios[idx];
    const ids = typeof sl === 'string' ? [sl] : (sl as TreinoSlot).ids;
    const done = ids.every(id => execucaoData[`${idx}-${id}`]?.concluido);
    if (!done) {
      nextIdx = idx;
      break;
    }
  }
  if (nextIdx === -1) return; // não há outro exercício pendente para pular

  cancelRestAlarmNotification();

  const updatedSession: StoredWorkoutSession = {
    ...session,
    activeSlotIndex: nextIdx,
    activeTimer: null,
    lastUpdated: Date.now()
  };
  await saveStoredWorkoutSession(updatedSession);
  broadcastSessionUpdate(updatedSession);

  const statusContent = buildStatusNotificationContent(treino, allExs, execucaoData, nextIdx);
  if (statusContent) {
    await fireStatusNotification(statusContent);
  }
};

let listenerRegistered = false;

// Chamar uma única vez, na raiz do app (App.tsx), independente de rota/login.
export const registerGlobalWorkoutNotificationListener = () => {
  if (!Capacitor.isNativePlatform()) return;
  if (listenerRegistered) return;
  listenerRegistered = true;

  ensureNativeNotificationsReady();

  LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const { actionId, notification } = event;
    const extra = (notification.extra || {}) as { slotIdx?: number; serieIdx?: number };

    if (actionId === 'complete_set' && typeof extra.slotIdx === 'number' && typeof extra.serieIdx === 'number') {
      completeSerieInStoredSession(extra.slotIdx, extra.serieIdx);
    } else if (actionId === 'skip_exercise' && typeof extra.slotIdx === 'number') {
      skipExercicioInStoredSession(extra.slotIdx);
    } else if (actionId === 'finish_workout') {
      // Finalizar precisa de revisão/confirmação visual (séries pendentes etc.),
      // então só leva o usuário até a tela do treino em vez de encerrar sozinho.
      getStoredWorkoutSession().then(session => {
        if (session?.treinoId) {
          window.location.hash = `#/execucao/${session.treinoId}`;
        }
      });
    }
  });
};
