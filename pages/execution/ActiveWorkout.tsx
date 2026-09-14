
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { getTreinos, getExercicios, addExecucao, updateUserProfile, getLastExercicioData, saveSessaoAtiva, getSessaoAtiva, deleteSessaoAtiva, updateExercicio } from '../../services/dbService';
import { Treino, Exercicio, ExercicioExecutado, SerieExecutada, TreinoSlot, SessaoAtiva } from '../../types';
import { Check, Square, Timer, Plus, Minus, X, ChevronDown, ChevronUp, Weight, Layers, Settings2, Save, AlertTriangle, FileText, Edit2, Bell, BellRing, BellOff } from 'lucide-react';

export const ActiveWorkout: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshProfile } = useAuth();
  
  const [treino, setTreino] = useState<Treino | null>(null);
  const [allExs, setAllExs] = useState<Record<string, Exercicio>>({});
  
  const [execucaoData, setExecucaoData] = useState<Record<string, ExercicioExecutado>>({});
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(0);
  const [dataInicio, setDataInicio] = useState<string>(new Date().toISOString());
  
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<number | null>(null);
  const targetEndTimeRef = useRef<number | null>(null);
  const silentKeepAliveRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');

  // Estados para o Modal de Ajuste
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [bulkWeight, setBulkWeight] = useState<Record<string, string>>({});
  const [bulkReps, setBulkReps] = useState<Record<string, string>>({});

  // Estados para Modal de Observações rápidas durante o treino
  const [editingObsExId, setEditingObsExId] = useState<string | null>(null);
  const [obsDraft, setObsDraft] = useState('');
  const [savingObs, setSavingObs] = useState(false);

  // Estado para o Modal de Confirmação de Encerramento
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);

  // Estado para controlar se o carregamento inicial foi concluído
  const [isInitialized, setIsInitialized] = useState(false);
  const isEndingRef = useRef(false);

  useEffect(() => {
    if (!user || !id) return;
    const init = async () => {
      try {
        const treinos = await getTreinos(user.uid);
        const t = treinos.find(x => x.id === id);
        if (!t) {
          alert("Treino não encontrado");
          navigate('/');
          return;
        }
        setTreino(t);

        const exsList = await getExercicios(user.uid);
        const exsMap: Record<string, Exercicio> = {};
        exsList.forEach(e => { if(e.id) exsMap[e.id] = e });
        setAllExs(exsMap);

        // Tentar carregar sessão ativa
        const sessaoSalva = await getSessaoAtiva(user.uid);
        
        if (sessaoSalva && sessaoSalva.treinoId === id) {
          setExecucaoData(sessaoSalva.execucaoData);
          setActiveSlotIndex(sessaoSalva.activeSlotIndex);
          setDataInicio(sessaoSalva.dataInicio);
        } else {
          // Se não há sessão ativa em andamento no banco, verificar se este treino
          // foi encerrado recentemente e o usuário caiu aqui pelo botão 'voltar' do celular/navegador.
          let wasConcludedRecently = false;
          try {
            const concludedTime = sessionStorage.getItem(`workout_concluded_${id}`) ||
              (sessionStorage.getItem('last_concluded_workout_id') === id ? sessionStorage.getItem('last_concluded_workout_time') : null);
            if (concludedTime) {
              const diffMs = Date.now() - Number(concludedTime);
              // Considera concluído nas últimas 2 horas
              if (diffMs < 2 * 60 * 60 * 1000) {
                wasConcludedRecently = true;
              }
            }
          } catch (e) {
            console.warn("Erro ao ler status de encerramento no sessionStorage:", e);
          }

          const locationState = location.state as { startWorkout?: boolean; timestamp?: number } | null;
          const isFreshExplicitStart = Boolean(
            locationState?.startWorkout && 
            locationState?.timestamp && 
            (Date.now() - locationState.timestamp < 30000)
          );

          // Se acabou de ser concluído e não foi um clique deliberado recente em "Iniciar Treino",
          // redireciona de volta para a Home sem reabrir nem recriar a sessão.
          if (wasConcludedRecently && !isFreshExplicitStart) {
            navigate('/', { replace: true });
            return;
          }

          const initialExecData: Record<string, ExercicioExecutado> = {};
          
          for (let i = 0; i < t.listaExercicios.length; i++) {
            const slot = t.listaExercicios[i];
            const ids = typeof slot === 'string' ? [slot] : (slot as TreinoSlot).ids;

            const slotHistories = await Promise.all(
              ids.map(exId => getLastExercicioData(user.uid, exId))
            );

            let maxSeries = 1;
            slotHistories.forEach(h => {
              if (h && h.series.length > maxSeries) maxSeries = h.series.length;
            });

            ids.forEach((exId, idx) => {
              const h = slotHistories[idx];
              let series: SerieExecutada[] = [];

              if (h && h.series.length > 0) {
                series = h.series.map(s => ({ ...s, concluida: false }));
                while (series.length < maxSeries) {
                  const last = series[series.length - 1];
                  series.push({
                    numero: series.length + 1,
                    peso: last?.peso || 0,
                    reps: last?.reps || 10,
                    concluida: false
                  });
                }
              } else {
                series = Array.from({ length: maxSeries }).map((_, sIdx) => ({
                  numero: sIdx + 1,
                  peso: 0,
                  reps: 10,
                  concluida: false
                }));
              }

              initialExecData[`${i}-${exId}`] = {
                exercicioId: exId,
                concluido: false,
                series: series
              };
            });
          }
          
          setExecucaoData(initialExecData);
          setActiveSlotIndex(0);
          setDataInicio(new Date().toISOString());
        }
        setIsInitialized(true);
      } catch (err) {
        console.error("Erro ao carregar dados do treino:", err);
      }
    };
    init();
  }, [id, user, navigate]);

  // Salvar sessão ativa sempre que houver mudanças
  useEffect(() => {
    if (!isInitialized || !user || !id || !treino || isEndingRef.current) return;

    const saveSession = async () => {
      if (isEndingRef.current) return;
      const sessao: SessaoAtiva = {
        userId: user.uid,
        treinoId: id,
        dataInicio,
        execucaoData,
        activeSlotIndex: activeSlotIndex
      };
      await saveSessaoAtiva(sessao);
    };

    saveSession();
  }, [execucaoData, activeSlotIndex, user, id, treino, isInitialized, dataInicio]);

  // Checagem de permissão de notificação
  useEffect(() => {
    if (!("Notification" in window)) {
      setNotifPermission('unsupported');
    } else {
      setNotifPermission(Notification.permission);
    }
    return () => {
      stopKeepAlive();
    };
  }, []);

  const requestNotifPermission = async () => {
    if (!("Notification" in window)) return;
    try {
      const res = await Notification.requestPermission();
      setNotifPermission(res);
      if (res === 'granted' && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && "showNotification" in reg) {
          reg.showNotification("🔔 Notificações Ativadas!", {
            body: "Você receberá alertas com vibração ao final de cada descanso.",
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: "notif-test"
          });
        }
      }
    } catch (e) {
      console.warn("Erro ao solicitar permissão de notificação:", e);
    }
  };

  // Áudio silencioso em segundo plano para impedir que navegadores móveis (Android/iOS) congelem o cronômetro ao alternar de app
  const startKeepAlive = () => {
    try {
      if (silentKeepAliveRef.current) return;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // Volume inaudível apenas para manter o processo ativo no sistema operacional
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.00001, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      silentKeepAliveRef.current = { ctx, osc, gain };
    } catch (e) {
      console.warn("Keep-alive audio não iniciado:", e);
    }
  };

  const stopKeepAlive = () => {
    try {
      if (silentKeepAliveRef.current) {
        silentKeepAliveRef.current.osc.stop();
        silentKeepAliveRef.current.osc.disconnect();
        silentKeepAliveRef.current.gain.disconnect();
        silentKeepAliveRef.current.ctx.close();
        silentKeepAliveRef.current = null;
      }
    } catch {}
  };

  const playSoundAlert = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.35, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      playTone(880, ctx.currentTime, 0.25);
      playTone(1174.66, ctx.currentTime + 0.15, 0.45);
    } catch (e) {
      console.warn("AudioContext não permitido ou falhou:", e);
    }
  };

  const notifyTimerComplete = async () => {
    stopKeepAlive();
    playSoundAlert();

    // 1. Vibração direta do dispositivo móvel
    if ("vibrate" in navigator) {
      try {
        navigator.vibrate([350, 150, 350, 150, 500]);
      } catch {}
    }

    // 2. Disparo na barra de notificações do celular (via Service Worker para Android/PWA)
    if ("Notification" in window && Notification.permission === "granted") {
      const notifTitle = "⏱️ Descanso Concluído!";
      const notifOptions: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
        body: `Hora da próxima série de ${treino?.nome || 'treino'}! Mantenha o foco.`,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [350, 150, 350, 150, 500],
        tag: "workout-timer",
        renotify: true,
        requireInteraction: true,
        silent: false,
        data: { url: window.location.href }
      };

      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if (reg && "showNotification" in reg) {
            await reg.showNotification(notifTitle, notifOptions);
            return;
          }
        }
      } catch (err) {
        console.warn("ServiceWorker showNotification falhou, tentando Notification:", err);
      }

      // Fallback
      try {
        new Notification(notifTitle, notifOptions);
      } catch (e) {
        console.warn("Fallback Notification falhou:", e);
      }
    }
  };

  const checkTimerTick = () => {
    if (!targetEndTimeRef.current) return;
    const now = Date.now();
    const remainingMs = targetEndTimeRef.current - now;
    const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));

    if (remainingSecs <= 0) {
      setTimeLeft(0);
      setTimerActive(false);
      targetEndTimeRef.current = null;
      try {
        sessionStorage.removeItem('active_workout_timer_end');
      } catch {}
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      notifyTimerComplete();
    } else {
      setTimeLeft(remainingSecs);
    }
  };

  // Restaurar timer do sessionStorage se houver contagem ativa
  useEffect(() => {
    try {
      const savedTimerEnd = sessionStorage.getItem('active_workout_timer_end');
      if (savedTimerEnd) {
        const targetEnd = Number(savedTimerEnd);
        const remaining = Math.ceil((targetEnd - Date.now()) / 1000);
        if (remaining > 0) {
          targetEndTimeRef.current = targetEnd;
          setTimeLeft(remaining);
          setTimerActive(true);
        } else {
          sessionStorage.removeItem('active_workout_timer_end');
        }
      }
    } catch {}
  }, []);

  // Loop de atualização contínua e recuperação instantânea ao trocar de app / voltar da tela de bloqueio
  useEffect(() => {
    if (!timerActive || !targetEndTimeRef.current) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Checagem imediata
    checkTimerTick();

    // Verificação de alta frequência (500ms) para contagem visual suave
    timerRef.current = window.setInterval(checkTimerTick, 500);

    const handleVisibilityOrFocus = () => {
      checkTimerTick();
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
    };
  }, [timerActive]);

  // Atualizar título da aba com o cronômetro para fácil acompanhamento em segundo plano
  useEffect(() => {
    const originalTitle = document.title;
    if (timeLeft !== null && timeLeft > 0) {
      const mins = Math.floor(timeLeft / 60);
      const secs = (timeLeft % 60).toString().padStart(2, '0');
      document.title = `⏱️ ${mins}:${secs} - ${treino?.nome || 'Treino'}`;
    } else if (timeLeft === 0) {
      document.title = `🔔 Descanso Concluído! - ${treino?.nome || 'Treino'}`;
    } else if (treino?.nome) {
      document.title = `${treino.nome} - Treino Ativo`;
    }
    return () => {
      document.title = originalTitle;
    };
  }, [timeLeft, treino?.nome]);

  // Se o tempo zerou, limpar aviso após alguns segundos
  useEffect(() => {
    if (timeLeft === 0) {
      const timeout = setTimeout(() => {
        setTimeLeft(null);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [timeLeft]);

  const startTimer = (seconds: number) => {
    // Pedir permissão de notificação se disponível e ainda não configurada
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
        .then(res => setNotifPermission(res))
        .catch(() => {});
    }

    startKeepAlive();

    const targetEnd = Date.now() + seconds * 1000;
    targetEndTimeRef.current = targetEnd;
    try {
      sessionStorage.setItem('active_workout_timer_end', targetEnd.toString());
    } catch {}
    setTimeLeft(seconds);
    setTimerActive(true);
  };
  
  const stopTimer = () => {
    stopKeepAlive();
    setTimerActive(false);
    setTimeLeft(null);
    targetEndTimeRef.current = null;
    try {
      sessionStorage.removeItem('active_workout_timer_end');
    } catch {}
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const toggleExpandSlot = (index: number) => {
    setActiveSlotIndex(prev => prev === index ? null : index);
  };

  const updateSerieValue = (slotIndex: number, exId: string, sIndex: number, field: keyof SerieExecutada, value: number) => {
    const key = `${slotIndex}-${exId}`;
    setExecucaoData(prev => {
      const next = { ...prev };
      if (!next[key] || !next[key].series[sIndex]) return prev;
      
      const newSeries = [...next[key].series];
      newSeries[sIndex] = { ...newSeries[sIndex], [field]: value };
      
      next[key] = { ...next[key], series: newSeries };
      return next;
    });
  };

  const applyBulkToEx = (slotIndex: number, exId: string) => {
    const w = parseFloat(bulkWeight[exId] || '');
    const r = parseInt(bulkReps[exId] || '');
    
    setExecucaoData(prev => {
      const next = { ...prev };
      const key = `${slotIndex}-${exId}`;
      if (!next[key]) return;
      next[key] = {
        ...next[key],
        series: next[key].series.map(s => ({
          ...s,
          peso: !isNaN(w) ? w : s.peso,
          reps: !isNaN(r) ? r : s.reps
        }))
      };
      return next;
    });
    
    setBulkWeight(prev => ({ ...prev, [exId]: '' }));
    setBulkReps(prev => ({ ...prev, [exId]: '' }));
  };

  const handleOpenEditObs = (exId: string) => {
    setEditingObsExId(exId);
    setObsDraft(allExs[exId]?.observacoes || '');
  };

  const handleSaveObs = async () => {
    if (!user || !editingObsExId) return;
    setSavingObs(true);
    try {
      await updateExercicio(user.uid, editingObsExId, { observacoes: obsDraft });
      setAllExs(prev => ({
        ...prev,
        [editingObsExId]: {
          ...prev[editingObsExId],
          observacoes: obsDraft
        }
      }));
      setEditingObsExId(null);
    } catch (e) {
      console.error("Erro ao salvar observação:", e);
      alert("Erro ao salvar observação.");
    } finally {
      setSavingObs(false);
    }
  };

  const toggleSerieSlot = (slotIndex: number, sIndex: number) => {
    if (!treino) return;
    const slot = treino.listaExercicios[slotIndex];
    const ids = typeof slot === 'string' ? [slot] : slot.ids;
    
    setExecucaoData(prev => {
      const next = { ...prev };
      const firstKey = `${slotIndex}-${ids[0]}`;
      if (!next[firstKey] || !next[firstKey].series[sIndex]) return prev;

      const newState = !next[firstKey].series[sIndex].concluida;
      
      ids.forEach(exId => {
        const key = `${slotIndex}-${exId}`;
        if (next[key]) {
          const newSeries = [...next[key].series];
          if (newSeries[sIndex]) {
            newSeries[sIndex] = { ...newSeries[sIndex], concluida: newState };
          }
          next[key] = { ...next[key], series: newSeries };
        }
      });

      if (newState) {
        const timerEx = ids.find(id => allExs[id]?.timerAtivo);
        if (timerEx) startTimer(allExs[timerEx].timerPadrao);

        const allSeriesDone = ids.every(id => next[`${slotIndex}-${id}`]?.series.every(s => s.concluida));

        if (allSeriesDone) {
           ids.forEach(id => { 
             const key = `${slotIndex}-${id}`;
             next[key] = { ...next[key], concluido: true };
           });
           setTimeout(() => {
             setActiveSlotIndex(prev => {
               if (prev === slotIndex && treino.listaExercicios[slotIndex + 1]) {
                 return slotIndex + 1;
               }
               return prev;
             });
           }, 400);
        } else {
           ids.forEach(id => { 
             const key = `${slotIndex}-${id}`;
             next[key] = { ...next[key], concluido: false };
           });
        }
      } else {
        ids.forEach(id => { 
          const key = `${slotIndex}-${id}`;
          next[key] = { ...next[key], concluido: false };
        });
      }
      
      return next;
    });
  };

  const addSerieToSlot = (slotIndex: number) => {
    if (!treino) return;
    const slot = treino.listaExercicios[slotIndex];
    const ids = typeof slot === 'string' ? [slot] : slot.ids;
    
    setExecucaoData(prev => {
      const next = { ...prev };
      ids.forEach(id => {
        const key = `${slotIndex}-${id}`;
        if (!next[key]) return;
        const currentSeries = next[key].series;
        const last = currentSeries[currentSeries.length - 1];
        
        next[key] = {
          ...next[key],
          series: [
            ...currentSeries,
            {
              numero: currentSeries.length + 1,
              peso: last?.peso || 0,
              reps: last?.reps || 10,
              concluida: false
            }
          ],
          concluido: false
        };
      });
      return next;
    });
  };

  const removeSerieFromSlot = (slotIndex: number) => {
    if (!treino) return;
    const slot = treino.listaExercicios[slotIndex];
    const ids = typeof slot === 'string' ? [slot] : slot.ids;
    
    setExecucaoData(prev => {
      const next = { ...prev };
      const firstKey = `${slotIndex}-${ids[0]}`;
      if (!next[firstKey] || next[firstKey].series.length <= 1) return prev;
      
      ids.forEach(id => {
        const key = `${slotIndex}-${id}`;
        if (!next[key]) return;
        const currentSeries = [...next[key].series];
        currentSeries.pop();
        
        const allDone = currentSeries.length > 0 && currentSeries.every(s => s.concluida);
        
        next[key] = {
          ...next[key],
          series: currentSeries,
          concluido: allDone
        };
      });
      return next;
    });
  };

  const handleEncerrarTreino = () => {
    if (!user || !treino) return;
    const arrData = Object.values(execucaoData) as ExercicioExecutado[];
    const hasPending = arrData.some(e => !e.concluido);
    
    if (hasPending) {
      setShowConfirmEnd(true);
    } else {
      executeEndWorkout();
    }
  };

  const executeEndWorkout = async () => {
    if (!user || !treino) return;
    isEndingRef.current = true;
    const arrData = Object.values(execucaoData) as ExercicioExecutado[];

    try {
      await addExecucao({
        userId: user.uid,
        treinoId: treino.id!,
        data: new Date().toISOString(),
        exerciciosExecutados: arrData,
        status: arrData.every(e => e.concluido) ? 'concluido' : 'incompleto'
      });
      await updateUserProfile(user.uid, { ultimoTreinoRealizado: treino.id });
      await deleteSessaoAtiva(user.uid);

      // Marcação para evitar que o botão de voltar do celular reabra o treino já encerrado
      try {
        const now = Date.now().toString();
        sessionStorage.setItem(`workout_concluded_${treino.id}`, now);
        sessionStorage.setItem('last_concluded_workout_id', treino.id!);
        sessionStorage.setItem('last_concluded_workout_time', now);
      } catch (e) {
        console.warn("Falha ao salvar marcação de encerramento:", e);
      }

      await refreshProfile();
      navigate('/', { replace: true });
    } catch (error) { 
      isEndingRef.current = false;
      console.error("Erro ao salvar execução:", error);
      alert("Erro ao salvar."); 
    }
  };

  if (!treino || Object.keys(execucaoData).length === 0) return <div className="p-12 text-center text-zinc-500">Iniciando...</div>;

  const currentEditingIds = editingSlotIndex !== null 
    ? (typeof treino.listaExercicios[editingSlotIndex] === 'string' 
        ? [treino.listaExercicios[editingSlotIndex] as string] 
        : (treino.listaExercicios[editingSlotIndex] as TreinoSlot).ids)
    : [];

  return (
    <div className="pb-24 animate-in fade-in duration-300">
      {/* Timer */}
      {timeLeft !== null && (
        <div className="fixed top-6 left-0 right-0 z-[60] flex justify-center p-2 pointer-events-none">
          <div className={`pointer-events-auto shadow-2xl rounded-3xl px-6 sm:px-8 py-3.5 sm:py-4 flex items-center space-x-4 sm:space-x-6 border border-white/10 backdrop-blur-md transition-all ${timeLeft === 0 ? 'bg-red-600 animate-pulse ring-4 ring-red-500/30' : 'bg-brand-600 shadow-brand-900/50'}`}>
            <Timer size={26} className="text-white shrink-0" />
            <div className="flex flex-col">
              <span className="text-white font-mono text-2xl sm:text-3xl font-black tracking-wider leading-none">
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
              {timeLeft === 0 && (
                <span className="text-[10px] text-white/90 font-bold uppercase tracking-widest mt-1">Tempo esgotado!</span>
              )}
            </div>
            <button 
              onClick={stopTimer} 
              className="p-2 bg-white/20 hover:bg-white/30 active:scale-95 rounded-full transition-all"
              title="Fechar timer"
            >
              <X size={18} className="text-white" />
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 px-2">
        <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0 mr-3">
              <h2 className="text-3xl font-black text-white tracking-tight">{treino.nome}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="bg-brand-900/40 text-brand-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-brand-800/30 uppercase">
                  {treino.listaExercicios.length} slots
                </span>

                {notifPermission === 'granted' ? (
                  <span className="flex items-center space-x-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                    <Bell size={11} />
                    <span>Alertas na barra ativos</span>
                  </span>
                ) : notifPermission !== 'unsupported' ? (
                  <button 
                    onClick={requestNotifPermission}
                    className="flex items-center space-x-1 text-[10px] font-bold text-amber-300 bg-amber-950/40 border border-amber-800/50 hover:bg-amber-900/50 px-2 py-0.5 rounded-full transition-all"
                    title="Ativar notificações na barra do celular"
                  >
                    <BellOff size={11} />
                    <span>Ativar alertas na barra</span>
                  </button>
                ) : null}
              </div>
            </div>
            <button onClick={() => navigate('/', { replace: true })} className="p-2 bg-zinc-900 rounded-xl border border-zinc-800 shrink-0"><X size={20}/></button>
        </div>
      </div>

      {notifPermission === 'default' && (
        <div className="bg-gradient-to-r from-brand-950/80 to-zinc-900 border border-brand-800/60 rounded-2xl p-3.5 mb-6 flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-3 mr-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-900/50 flex items-center justify-center text-brand-400 shrink-0">
              <BellRing size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white">Alertas na barra de notificações</p>
              <p className="text-[11px] text-zinc-400 leading-tight">
                Receba vibração e aviso na barra do celular quando o descanso terminar, mesmo fora do app.
              </p>
            </div>
          </div>
          <button
            onClick={requestNotifPermission}
            className="bg-brand-600 hover:bg-brand-500 text-white font-black text-xs px-3.5 py-2.5 rounded-xl shrink-0 transition-all active:scale-95 shadow-md shadow-brand-900/40"
          >
            Ativar
          </button>
        </div>
      )}

      <div className="space-y-4">
        {treino.listaExercicios.map((slot, slotIndex) => {
          const ids = typeof slot === 'string' ? [slot] : slot.ids;
          const isCombined = ids.length > 1;
          const isExpanded = activeSlotIndex === slotIndex;
          const isDone = ids.every(id => execucaoData[`${slotIndex}-${id}`]?.concluido);
          const hasAnyObs = ids.some(id => allExs[id]?.observacoes?.trim());
          
          const title = ids.map(id => allExs[id]?.nome || "Exercicio").join(' / ');
          const muscleGroups = Array.from(new Set(ids.map(id => allExs[id]?.grupoMuscular || ""))).join(', ');
          const seriesCount = execucaoData[`${slotIndex}-${ids[0]}`]?.series.length || 0;

          return (
            <div key={slotIndex} className={`bg-zinc-900 rounded-3xl border overflow-hidden transition-all ${isExpanded ? 'border-brand-500 ring-4 ring-brand-500/10' : 'border-zinc-800'} ${isDone && !isExpanded ? 'opacity-70' : ''}`}>
              <div onClick={() => toggleExpandSlot(slotIndex)} className="p-4 sm:p-5 flex justify-between items-center cursor-pointer select-none">
                <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0 mr-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 transition-colors ${isDone ? 'bg-green-600 text-white' : isExpanded ? 'bg-brand-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                    {isDone ? <Check size={20} strokeWidth={4} /> : slotIndex + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-black text-white text-base sm:text-lg tracking-tight leading-snug break-words [overflow-wrap:anywhere] ${isDone ? 'line-through decoration-zinc-600 text-zinc-400' : ''}`}>{title}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <p className="text-[11px] text-zinc-500 font-bold uppercase truncate">{muscleGroups}</p>
                      {isCombined && <Layers size={10} className="text-brand-500 shrink-0" />}
                      {hasAnyObs && (
                        <span className="flex items-center space-x-1 text-[9px] font-black text-amber-400 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.5 rounded-md shrink-0">
                          <FileText size={10} />
                          <span>OBS</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bg-zinc-800/50 p-2 rounded-xl shrink-0 ml-2">
                  {isExpanded ? <ChevronUp size={20} className="text-zinc-400" /> : <ChevronDown size={20} className="text-zinc-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-6 pt-2 border-t border-zinc-800 animate-in slide-in-from-top-4 duration-300">
                  {/* Observações dos Exercícios do Slot */}
                  {hasAnyObs && (
                    <div className="space-y-2.5 mb-5 mt-2">
                      {ids.map(exId => {
                        const ex = allExs[exId];
                        const obs = ex?.observacoes?.trim();
                        if (!obs) return null;
                        return (
                          <div 
                            key={`obs-${exId}`} 
                            className="bg-amber-950/20 border border-amber-800/40 rounded-2xl p-3.5 flex items-start space-x-3 text-left group"
                          >
                            <div className="p-1.5 bg-amber-900/40 rounded-xl text-amber-400 shrink-0 mt-0.5">
                              <FileText size={15} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                                  {isCombined ? `Obs • ${ex?.nome}` : 'Observações do Exercício'}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEditObs(exId);
                                  }}
                                  className="text-zinc-400 hover:text-amber-400 text-[10px] font-bold flex items-center space-x-1 px-1.5 py-0.5 rounded-lg hover:bg-amber-950/50 transition-colors"
                                  title="Editar observação"
                                >
                                  <Edit2 size={11} />
                                  <span>Editar</span>
                                </button>
                              </div>
                              <p className="text-xs text-zinc-200 whitespace-pre-line leading-relaxed break-words [overflow-wrap:anywhere]">
                                {obs}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-3 mb-6">
                    {Array.from({ length: seriesCount }).map((_, sIndex) => {
                      const isSerieDone = ids.every(id => execucaoData[`${slotIndex}-${id}`]?.series[sIndex]?.concluida);
                      
                      return (
                        <div key={sIndex} className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${isSerieDone ? 'bg-brand-950/10 border-brand-500/30' : 'bg-black border-zinc-800/50'}`}>
                          <div className="flex items-center space-x-4">
                            <span className="font-black text-zinc-600 text-xs w-4">{sIndex + 1}</span>
                            <div className="space-y-1">
                                {ids.map(exId => {
                                    const ex = allExs[exId];
                                    const serie = execucaoData[`${slotIndex}-${exId}`]?.series[sIndex];
                                    const u1 = ex?.unidadePrincipal || 'kg';
                                    const u2 = ex?.unidadeSecundaria || 'reps';
                                    
                                    return (
                                        <div key={exId} className="flex items-center space-x-2 text-xs">
                                            <span className="font-black text-white">{serie?.peso}{u1}</span>
                                            <span className="text-zinc-500">×</span>
                                            <span className="font-black text-white">{serie?.reps}</span>
                                            <span className="text-[8px] text-zinc-600 uppercase font-black">
                                              {isCombined ? ex?.nome.substring(0,8) + '..' : u2}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => toggleSerieSlot(slotIndex, sIndex)}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isSerieDone ? 'bg-green-500 text-white shadow-lg' : 'bg-zinc-800 text-zinc-600'}`}
                          >
                            <Check strokeWidth={4} size={20} />
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex flex-wrap gap-2 items-center pt-5 border-t border-zinc-800">
                    <button onClick={() => addSerieToSlot(slotIndex)} className="flex-1 text-brand-400 text-[10px] font-black flex items-center justify-center px-3 py-3 bg-brand-950/20 rounded-xl border border-brand-900/30 active:scale-95 transition-transform">
                      <Plus size={14} className="mr-1.5" /> NOVA SÉRIE
                    </button>
                    <button onClick={() => removeSerieFromSlot(slotIndex)} className="flex-1 text-red-400 text-[10px] font-black flex items-center justify-center px-3 py-3 bg-red-950/10 rounded-xl border border-red-900/20 active:scale-95 transition-transform disabled:opacity-20" disabled={seriesCount <= 1}>
                      <Minus size={14} className="mr-1.5" /> REMOVER SÉRIE
                    </button>
                    <button onClick={() => setEditingSlotIndex(slotIndex)} className="text-zinc-300 text-[10px] font-black flex items-center justify-center px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl border border-zinc-700 active:scale-95 transition-transform">
                      <Settings2 size={16} className="mr-1.5" /> AJUSTAR
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-12 px-2">
        <button onClick={handleEncerrarTreino} className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-6 rounded-3xl shadow-xl flex items-center justify-center space-x-3 active:scale-[0.98] transition-all">
          <Square fill="white" size={20} />
          <span className="tracking-widest text-lg uppercase">Encerrar Treino</span>
        </button>
      </div>

      {/* MODAL DE AJUSTE (POPUP) */}
      {editingSlotIndex !== null && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] border-t sm:border border-zinc-800 p-8 shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-10 duration-300">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-black text-white">Configurar Séries</h3>
                <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mt-1">Ajuste peso e repetições</p>
              </div>
              <button onClick={() => setEditingSlotIndex(null)} className="p-2 bg-zinc-800 text-zinc-400 rounded-full">
                <X size={24} />
              </button>
            </div>

            {/* EDIÇÃO UNITÁRIA */}
            <div className="space-y-10">
                {currentEditingIds.map(exId => {
                    const ex = allExs[exId];
                    const u1 = ex?.unidadePrincipal || 'kg';
                    const u2 = ex?.unidadeSecundaria || 'reps';

                    return (
                        <div key={exId} className="space-y-6">
                            <div className="flex items-center justify-between border-l-4 border-brand-500 pl-3">
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-black text-white text-base break-words [overflow-wrap:anywhere]">{ex?.nome}</h4>
                                    <span className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">{ex?.grupoMuscular}</span>
                                </div>
                            </div>

                            {/* OBSERVAÇÃO DO EXERCÍCIO */}
                            <div className="bg-zinc-950/60 border border-zinc-800 p-4 rounded-2xl">
                                <div className="flex justify-between items-center mb-1.5">
                                    <div className="flex items-center space-x-2 text-amber-400">
                                        <FileText size={14} />
                                        <span className="text-[10px] font-black uppercase tracking-wider">Observações</span>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => handleOpenEditObs(exId)}
                                        className="text-amber-400 hover:text-amber-300 text-[10px] font-black uppercase flex items-center space-x-1 transition-colors"
                                    >
                                        <Edit2 size={11} />
                                        <span>{ex?.observacoes?.trim() ? 'Editar' : '+ Adicionar'}</span>
                                    </button>
                                </div>
                                {ex?.observacoes?.trim() ? (
                                    <p className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed break-words [overflow-wrap:anywhere]">
                                        {ex.observacoes}
                                    </p>
                                ) : (
                                    <p className="text-xs text-zinc-600 italic">Nenhuma observação configurada para este exercício.</p>
                                )}
                            </div>

                            {/* APLICAÇÃO EM MASSA POR EXERCÍCIO */}
                            <div className="bg-zinc-950/50 border border-zinc-800 p-4 rounded-2xl">
                                <div className="grid grid-cols-12 gap-2 items-end">
                                    <div className="col-span-5">
                                        <label className="block text-[8px] font-black text-zinc-600 uppercase mb-1 ml-1">Peso Padrão</label>
                                        <div className="relative">
                                            <input 
                                                type="number" step="0.1" placeholder="0.0"
                                                value={bulkWeight[exId] || ''} 
                                                onChange={e => setBulkWeight(prev => ({ ...prev, [exId]: e.target.value }))}
                                                className="w-full bg-black border border-zinc-800 rounded-xl py-2.5 px-3 text-center text-xs text-white font-black outline-none focus:ring-1 focus:ring-brand-500"
                                            />
                                            <span className="absolute right-2 top-3 text-[8px] font-black text-zinc-700 uppercase">{u1}</span>
                                        </div>
                                    </div>
                                    <div className="col-span-5">
                                        <label className="block text-[8px] font-black text-zinc-600 uppercase mb-1 ml-1">Reps Padrão</label>
                                        <div className="relative">
                                            <input 
                                                type="number" placeholder="0"
                                                value={bulkReps[exId] || ''} 
                                                onChange={e => setBulkReps(prev => ({ ...prev, [exId]: e.target.value }))}
                                                className="w-full bg-black border border-zinc-800 rounded-xl py-2.5 px-3 text-center text-xs text-white font-black outline-none focus:ring-1 focus:ring-brand-500"
                                            />
                                            <span className="absolute right-2 top-3 text-[8px] font-black text-zinc-700 uppercase">{u2}</span>
                                        </div>
                                    </div>
                                    <div className="col-span-2">
                                        <button 
                                            onClick={() => applyBulkToEx(editingSlotIndex!, exId)}
                                            className="w-full h-[38px] bg-brand-600 hover:bg-brand-500 text-white rounded-xl flex items-center justify-center transition-all active:scale-90"
                                            title="Aplicar a todas as séries deste exercício"
                                        >
                                            <Check size={16} strokeWidth={3} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="space-y-3">
                                {execucaoData[`${editingSlotIndex}-${exId}`]?.series.map((serie, sIdx) => {
                                    return (
                                        <div key={sIdx} className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-1 text-[10px] font-black text-zinc-600">{sIdx+1}</div>
                                            <div className="col-span-5">
                                                <div className="relative">
                                                    <input 
                                                        type="number" step="0.1"
                                                        value={serie.peso}
                                                        onChange={e => updateSerieValue(editingSlotIndex!, exId, sIdx, 'peso', parseFloat(e.target.value)||0)}
                                                        className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-3 text-center text-xs text-white font-black outline-none focus:ring-1 focus:ring-brand-500"
                                                    />
                                                    <span className="absolute right-3 top-3.5 text-[8px] font-black text-zinc-700 uppercase">{u1}</span>
                                                </div>
                                            </div>
                                            <div className="col-span-5">
                                                <div className="relative">
                                                    <input 
                                                        type="number"
                                                        value={serie.reps}
                                                        onChange={e => updateSerieValue(editingSlotIndex!, exId, sIdx, 'reps', parseInt(e.target.value)||0)}
                                                        className="w-full bg-black border border-zinc-800 rounded-xl py-3 px-3 text-center text-xs text-white font-black outline-none focus:ring-1 focus:ring-brand-500"
                                                    />
                                                    <span className="absolute right-3 top-3.5 text-[8px] font-black text-zinc-700 uppercase">{u2}</span>
                                                </div>
                                            </div>
                                            <div className="col-span-1 flex justify-center">
                                                {serie.concluida && <Check size={14} className="text-green-500" />}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            <button 
                onClick={() => setEditingSlotIndex(null)}
                className="w-full mt-10 bg-zinc-800 hover:bg-zinc-700 text-white font-black py-5 rounded-3xl transition-all flex items-center justify-center"
            >
                <Save size={20} className="mr-2" /> SALVAR E VOLTAR
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE OBSERVAÇÃO RÁPIDA */}
      {editingObsExId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full max-w-md rounded-[32px] border border-zinc-800 p-6 shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-black text-white">Observações do Exercício</h3>
                <p className="text-xs text-amber-400 font-bold uppercase tracking-wider mt-0.5">
                  {allExs[editingObsExId]?.nome}
                </p>
              </div>
              <button 
                onClick={() => setEditingObsExId(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-xl bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-zinc-400 mb-3">
              Dicas de postura, regulagem do aparelho ou orientações de execução:
            </p>

            <textarea
              value={obsDraft}
              onChange={e => setObsDraft(e.target.value)}
              placeholder="Ex: Banco inclinado a 45º, focar na fase excêntrica..."
              rows={4}
              className="w-full bg-black border border-zinc-800 rounded-2xl p-3.5 text-white text-xs leading-relaxed outline-none focus:ring-2 focus:ring-amber-500 resize-none mb-4"
            />

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setEditingObsExId(null)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3.5 rounded-2xl text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingObs}
                onClick={handleSaveObs}
                className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-black py-3.5 rounded-2xl text-xs shadow-lg shadow-amber-900/30 transition-colors"
              >
                {savingObs ? 'Salvando...' : 'Salvar Observação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE ENCERRAMENTO */}
      {showConfirmEnd && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full max-w-sm rounded-[40px] border border-zinc-800 p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle size={40} className="text-orange-500" />
              </div>
              <h3 className="text-2xl font-black text-white mb-2">Exercícios Pendentes</h3>
              <p className="text-zinc-400 text-sm mb-8">Você ainda não completou todos os exercícios deste treino. Deseja encerrar mesmo assim?</p>
              
              <div className="w-full space-y-3">
                <button 
                  onClick={executeEndWorkout}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-2xl shadow-lg transition-all active:scale-95"
                >
                  SIM, ENCERRAR AGORA
                </button>
                <button 
                  onClick={() => setShowConfirmEnd(false)}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-2xl transition-all active:scale-95"
                >
                  CONTINUAR TREINANDO
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
