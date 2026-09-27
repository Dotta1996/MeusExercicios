// Primitivas de notificação nativa (Android/Capacitor) para o fluxo de treino.
// Centralizado aqui para ser usado tanto pela tela de execução (toques dentro do
// app) quanto pelo listener global de ações de notificação (services/workoutActions.ts),
// que precisa funcionar mesmo sem nenhuma tela do app montada (ex: tocar em
// "Concluir Série" com a tela do celular apagada).

import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { LocalNotificationSchema } from '@capacitor/local-notifications';
import { Treino, Exercicio, ExercicioExecutado, TreinoSlot } from '../types';

export const STATUS_NOTIFICATION_ID = 887712;
export const STATUS_CHANNEL = 'workout-status';
export const REST_COUNTDOWN_ID = 887713;
export const ACTION_TYPE_NEXT_STEP = 'workout-next-step';
export const ACTION_TYPE_FINISHED = 'workout-finished';

// Plugin nativo pequeno (android/app/.../CountdownNotificationPlugin.java) que
// mostra uma notificação com contagem regressiva ao vivo usando o "chronometer"
// nativo do Android — o texto do contador é desenhado pelo próprio sistema
// operacional a partir de um horário-alvo, sem nenhum JS "tickando" em segundo
// plano, então continua certo mesmo com a tela apagada.
interface CountdownNotificationPlugin {
  show(options: { id: number; title: string; targetMillis: number }): Promise<void>;
  cancel(options: { id: number }): Promise<void>;
}
const CountdownNotification = registerPlugin<CountdownNotificationPlugin>('CountdownNotification');

// Recebe o horário-alvo (epoch ms) já calculado, em vez de "segundos a partir de
// agora" — assim ela conta exatamente o mesmo horário-alvo que o cronômetro na
// tela do app, sem depender de quando essa chamada nativa é efetivamente
// processada (evita a contagem nativa "atrasar" por causa de outras chamadas
// assíncronas na frente dela).
export const showRestCountdown = (targetEpochMillis: number, title: string) => {
  if (!Capacitor.isNativePlatform()) return;
  CountdownNotification.show({ id: REST_COUNTDOWN_ID, title, targetMillis: Math.round(targetEpochMillis) }).catch(() => {});
};

export const cancelRestCountdown = () => {
  if (!Capacitor.isNativePlatform()) return;
  CountdownNotification.cancel({ id: REST_COUNTDOWN_ID }).catch(() => {});
};

let readyPromise: Promise<void> | null = null;
let readyFlag = false;

// Garante que os canais e os tipos de ação nativos já foram registrados antes de
// qualquer notificação sair. Idempotente e compartilhado (module-level, não preso
// a nenhum componente React) — assim qualquer chamador, incluindo o listener
// global, se beneficia do mesmo registro sem repeti-lo.
export const ensureNativeNotificationsReady = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  if (readyFlag) return;
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        await LocalNotifications.createChannel({
          id: STATUS_CHANNEL,
          name: 'Próxima Série',
          description: 'Mostra a próxima série a executar, com botão para concluir',
          importance: 4,
          visibility: 1,
          vibration: true
        });
        await LocalNotifications.registerActionTypes({
          types: [
            { id: ACTION_TYPE_NEXT_STEP, actions: [
              { id: 'complete_set', title: '✅ Concluir Série' },
              { id: 'skip_exercise', title: '⏭️ Pular Exercício' }
            ] },
            { id: ACTION_TYPE_FINISHED, actions: [{ id: 'finish_workout', title: '🏁 Finalizar Treino' }] }
          ]
        });
        readyFlag = true;
      } catch (e) {
        console.warn("Erro ao configurar notificações nativas:", e);
      }
    })();
  }
  await readyPromise;
};

export type StatusNotifContent =
  | { kind: 'finished' }
  | { kind: 'next-step'; exName: string; title: string; body: string; largeBody?: string; slotIdx: number; serieIdx: number };

// Calcula o que a notificação de status deveria mostrar, sem disparar nada.
// Recebe os dados explicitamente (em vez de refs de componente) para poder ser
// usada tanto pela tela de execução quanto pelo listener global sem UI nenhuma.
export const buildStatusNotificationContent = (
  treino: Treino,
  allExs: Record<string, Exercicio>,
  execucaoData: Record<string, ExercicioExecutado>,
  fromSlotIdx: number
): StatusNotifContent | null => {
  if (!treino) return null;

  let targetSlotIdx = fromSlotIdx;
  let targetSlot = treino.listaExercicios[targetSlotIdx];

  if (targetSlot) {
    const slotIds = typeof targetSlot === 'string' ? [targetSlot] : targetSlot.ids;
    const isSlotDone = slotIds.every(id => execucaoData[`${targetSlotIdx}-${id}`]?.concluido);
    if (isSlotDone) {
      const nextIncomplete = treino.listaExercicios.findIndex((sl, idx) => {
        const ids = typeof sl === 'string' ? [sl] : sl.ids;
        return !ids.every(id => execucaoData[`${idx}-${id}`]?.concluido);
      });
      if (nextIncomplete !== -1) {
        targetSlotIdx = nextIncomplete;
        targetSlot = treino.listaExercicios[targetSlotIdx];
      }
    }
  }

  const allSlotsFinished = treino.listaExercicios.every((sl, idx) => {
    const ids = typeof sl === 'string' ? [sl] : sl.ids;
    return ids.every(id => execucaoData[`${idx}-${id}`]?.concluido);
  });
  if (allSlotsFinished) return { kind: 'finished' };
  if (!targetSlot) return null;

  const ids = typeof targetSlot === 'string' ? [targetSlot] : targetSlot.ids;
  const firstExId = ids[0];
  const exName = ids.map(id => allExs[id]?.nome || 'Exercício').join(' / ');
  const seriesList = execucaoData[`${targetSlotIdx}-${firstExId}`]?.series || [];
  const uncompletedIdx = seriesList.findIndex(s => !s.concluida);

  const currentSerieNum = uncompletedIdx !== -1 ? uncompletedIdx + 1 : seriesList.length;
  const totalSeries = seriesList.length;
  const targetSerie = uncompletedIdx !== -1 ? uncompletedIdx : 0;

  // Exercício combinado (conjunto/superset): detalha peso/reps de cada um dos
  // exercícios do slot, não só do primeiro.
  const isCombined = ids.length > 1;
  const detailLines = ids.map(exId => {
    const serie = execucaoData[`${targetSlotIdx}-${exId}`]?.series?.[targetSerie];
    const reps = serie ? serie.reps : 10;
    const peso = serie ? serie.peso : 0;
    const nome = allExs[exId]?.nome || 'Exercício';
    return isCombined ? `${nome}: ${reps} reps • ${peso}kg` : `${reps} reps • ${peso}kg`;
  });

  // O corpo (linha visível por padrão, antes dos botões) fica vazio de propósito:
  // como o Android sempre desenha os botões de ação por último — depois de
  // título e corpo, nessa ordem, sem exceção —, deixar o corpo vazio é o mais
  // perto que dá de "botão logo depois do nome do exercício". O detalhamento
  // completo (peso/reps) vai só no largeBody, visível ao expandir a notificação.
  return {
    kind: 'next-step',
    exName,
    title: `🔔 Série ${currentSerieNum}/${totalSeries} • ${exName}`,
    body: '',
    largeBody: detailLines.join('\n'),
    slotIdx: targetSlotIdx,
    serieIdx: targetSerie
  };
};

const statusNotifToSchema = (content: StatusNotifContent, atMillis?: number): LocalNotificationSchema => {
  const schedule = atMillis ? { at: new Date(atMillis), allowWhileIdle: true } : undefined;
  if (content.kind === 'finished') {
    return {
      id: STATUS_NOTIFICATION_ID,
      title: "🎉 Treino Concluído!",
      body: "Todas as séries foram finalizadas. Toque para encerrar e salvar!",
      channelId: STATUS_CHANNEL,
      actionTypeId: ACTION_TYPE_FINISHED,
      extra: {},
      schedule
    };
  }
  return {
    id: STATUS_NOTIFICATION_ID,
    title: content.title,
    body: content.body,
    largeBody: content.largeBody,
    channelId: STATUS_CHANNEL,
    actionTypeId: ACTION_TYPE_NEXT_STEP,
    extra: { slotIdx: content.slotIdx, serieIdx: content.serieIdx },
    schedule
  };
};

// Mostra a contagem regressiva ao vivo agora (visual, sem botão) e agenda a
// notificação acionável (com os botões) pra aparecer só quando o descanso
// realmente terminar — construída inteiramente pelo plugin nativo do
// LocalNotifications no momento certo (via AlarmManager), então não depende de
// nenhum JS rodando naquele instante. Nada de notificação "descanso concluído"
// separada: quando o tempo acaba, quem aparece já é a notificação com os botões.
export const fireRestStartNotifications = async (
  targetEndTime: number,
  restLabel: string,
  statusContent: StatusNotifContent | null
): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  // Disparada primeiro e sem esperar nada — é o que o usuário vê imediatamente,
  // e usa o MESMO horário-alvo que o cronômetro da tela do app, então os dois
  // nunca divergem, não importa quanto as chamadas abaixo demorem.
  showRestCountdown(targetEndTime, restLabel);
  try {
    await ensureNativeNotificationsReady();
    if (statusContent) {
      await LocalNotifications.schedule({ notifications: [statusNotifToSchema(statusContent, targetEndTime)] });
    }
  } catch (e) {
    console.warn("Erro ao agendar notificações de início de descanso:", e);
  }
};

export const fireStatusNotification = async (content: StatusNotifContent): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ensureNativeNotificationsReady();
    await LocalNotifications.schedule({ notifications: [statusNotifToSchema(content)] });
  } catch (e) {
    console.warn("Erro ao emitir notificação interativa:", e);
  }
};

// Cancela o descanso em andamento: a contagem visual e a notificação acionável
// que estava agendada para aparecer no fim dele (quem chamar isso é responsável
// por mostrar o status atual na hora, se fizer sentido — ver stopTimer/skip).
export const cancelRestAlarmNotification = () => {
  cancelRestCountdown();
  if (!Capacitor.isNativePlatform()) return;
  LocalNotifications.cancel({ notifications: [{ id: STATUS_NOTIFICATION_ID }] }).catch(() => {});
};

export const clearStatusNotification = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: STATUS_NOTIFICATION_ID }] });
  } catch (e) {
    console.warn("Erro ao limpar notificação interativa:", e);
  }
};

export const getSlotTimerInfo = (
  treino: Treino,
  allExs: Record<string, Exercicio>,
  slotIndex: number
): { duration: number; enabled: boolean } => {
  const slot = treino.listaExercicios[slotIndex];
  if (!slot) return { duration: 60, enabled: true };
  const ids = typeof slot === 'string' ? [slot] : (slot as TreinoSlot).ids;

  for (const exId of ids) {
    const ex = allExs[exId];
    if (ex) {
      const enabled = ex.timerAtivo !== false;
      const numDur = Number(ex.timerPadrao);
      const duration = !isNaN(numDur) && numDur > 0 ? Math.round(numDur) : 60;
      return { duration, enabled };
    }
  }
  return { duration: 60, enabled: true };
};
