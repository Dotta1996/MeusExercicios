
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Activity, CalendarDays, History, X, CheckCircle2, Circle, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { getTreinos, getExecucoes, getSessaoAtiva, getExercicios } from '../services/dbService';
import { Treino, ExecucaoTreino, SessaoAtiva, Exercicio } from '../types';
// Fixed: replaced parseISO with native Date logic and fixed locale import path
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';

export const Home: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [treinos, setTreinos] = useState<Treino[]>([]);
  const [exercicios, setExercicios] = useState<Record<string, Exercicio>>({});
  const [execucoes, setExecucoes] = useState<ExecucaoTreino[]>([]);
  const [nextTreino, setNextTreino] = useState<Treino | null>(null);
  const [sessaoAtiva, setSessaoAtiva] = useState<SessaoAtiva | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAllTreinos, setShowAllTreinos] = useState(false);
  const [selectedExec, setSelectedExec] = useState<ExecucaoTreino | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const [fetchedTreinos, fetchedExecucoes, fetchedSessao, fetchedExs] = await Promise.all([
          getTreinos(user.uid),
          getExecucoes(user.uid),
          getSessaoAtiva(user.uid),
          getExercicios(user.uid)
        ]);
        setTreinos(fetchedTreinos);
        setExecucoes(fetchedExecucoes);
        setSessaoAtiva(fetchedSessao);
        
        const exsMap: Record<string, Exercicio> = {};
        fetchedExs.forEach(ex => { if(ex.id) exsMap[ex.id] = ex; });
        setExercicios(exsMap);

        if (fetchedTreinos.length > 0) {
          const sequenceTreinos = fetchedTreinos.filter(t => !t.esporadico);
          
          if (sequenceTreinos.length > 0) {
            // Determine next workout logic from sequence only
            if (!profile?.ultimoTreinoRealizado) {
              setNextTreino(sequenceTreinos[0]);
            } else {
              const lastIndex = sequenceTreinos.findIndex(t => t.id === profile.ultimoTreinoRealizado);
              if (lastIndex !== -1 && lastIndex < sequenceTreinos.length - 1) {
                setNextTreino(sequenceTreinos[lastIndex + 1]);
              } else {
                setNextTreino(sequenceTreinos[0]); // Loop back
              }
            }
          } else {
            setNextTreino(fetchedTreinos[0]); // Fallback if all are sporadic
          }
        }
      } catch (error) {
        console.error("Error fetching home data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, profile]);

  if (loading) return <div className="flex justify-center p-8"><Activity className="animate-pulse text-brand-500" /></div>;

  const weeklyExecs = execucoes.filter(e => {
     const diff = new Date().getTime() - new Date(e.data).getTime();
     return diff <= 7 * 24 * 60 * 60 * 1000;
  });

  const activeTreinoNome = sessaoAtiva ? treinos.find(t => t.id === sessaoAtiva.treinoId)?.nome : null;

  return (
    <div className="space-y-6">
      {sessaoAtiva && activeTreinoNome && (
        <div className="bg-brand-600 rounded-xl p-5 border border-brand-500 shadow-lg shadow-brand-900/40 animate-in slide-in-from-top-4 duration-500">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h2 className="text-white text-xs font-black uppercase tracking-widest mb-1">Treino em Andamento</h2>
              <h3 className="text-xl font-black text-white">{activeTreinoNome}</h3>
            </div>
            <div className="bg-white/20 p-2 rounded-lg">
              <Activity className="text-white animate-pulse" size={20} />
            </div>
          </div>
          <button 
            onClick={() => navigate(`/execucao/${sessaoAtiva.treinoId}`)}
            className="w-full bg-white text-brand-600 font-black py-3 rounded-xl flex items-center justify-center space-x-2 active:scale-95 transition-transform"
          >
            <Play fill="currentColor" size={18} />
            <span>CONTINUAR TREINO</span>
          </button>
        </div>
      )}

      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 shadow-sm">
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-zinc-400 text-sm font-medium">Próximo Treino</h2>
          {treinos.length > 1 && (
            <button 
              onClick={() => setShowAllTreinos(!showAllTreinos)}
              className="text-xs text-brand-500 font-bold uppercase tracking-wider"
            >
              {showAllTreinos ? 'Ver Sugestão' : 'Escolher Outro'}
            </button>
          )}
        </div>

        {showAllTreinos ? (
          <div className="space-y-3 mt-4">
            {treinos.map(t => (
              <button
                key={t.id}
                onClick={() => navigate(`/execucao/${t.id}`)}
                className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex justify-between items-center text-left hover:border-brand-500 transition-colors"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="font-bold text-white">{t.nome}</p>
                    {t.esporadico && (
                      <span className="text-[8px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700 uppercase font-black">Esporádico</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">{t.listaExercicios.length} exercícios</p>
                </div>
                <Play size={16} className="text-brand-500" fill="currentColor" />
              </button>
            ))}
          </div>
        ) : nextTreino ? (
          <>
            <h3 className="text-2xl font-bold text-white mb-4">{nextTreino.nome}</h3>
            <p className="text-sm text-zinc-400 mb-6">{nextTreino.listaExercicios.length} exercícios na sequência</p>
            <button
              onClick={() => navigate(`/execucao/${nextTreino.id}`)}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-4 rounded-xl flex items-center justify-center space-x-2 transition-transform active:scale-95 shadow-lg shadow-brand-900/20"
            >
              <Play fill="currentColor" size={20} />
              <span>Iniciar Próximo Treino</span>
            </button>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-zinc-400 mb-4">Nenhum treino cadastrado.</p>
            <button onClick={() => navigate('/treinos/novo')} className="text-brand-400 hover:text-brand-300 font-medium">
              Criar meu primeiro treino
            </button>
          </div>
        )}
      </div>

      {/* CALENDÁRIO DE TREINOS */}
      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white font-bold flex items-center">
            <CalendarDays size={18} className="mr-2 text-brand-500" />
            Frequência Mensal
          </h2>
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-black text-white uppercase tracking-widest min-w-[120px] text-center">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
            <div key={i} className="text-center text-[10px] font-black text-zinc-600 py-2 uppercase">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {(() => {
            const monthStart = startOfMonth(currentMonth);
            const monthEnd = endOfMonth(monthStart);
            const startDate = startOfWeek(monthStart);
            const endDate = endOfWeek(monthEnd);
            
            const calendarDays = eachDayOfInterval({
              start: startDate,
              end: endDate,
            });

            return calendarDays.map((day, i) => {
              const hasWorkout = execucoes.some(exec => isSameDay(new Date(exec.data), day));
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isDayToday = isToday(day);

              return (
                <div 
                  key={i} 
                  className={`aspect-square flex flex-col items-center justify-center rounded-xl text-xs font-bold relative transition-all
                    ${!isCurrentMonth ? 'text-zinc-800' : 'text-zinc-400'}
                    ${hasWorkout ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30' : 'hover:bg-zinc-800/50'}
                    ${isDayToday ? 'ring-2 ring-zinc-700' : ''}
                  `}
                >
                  {day.getDate()}
                  {hasWorkout && (
                    <div className="absolute bottom-1.5 w-1 h-1 bg-brand-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                  )}
                </div>
              );
            });
          })()}
        </div>
        
        <div className="mt-6 flex items-center justify-center space-x-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          <div className="flex items-center">
            <div className="w-2 h-2 bg-brand-600/20 border border-brand-500/30 rounded-full mr-2" />
            <span>Treino Realizado</span>
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 ring-2 ring-zinc-700 rounded-full mr-2" />
            <span>Hoje</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
          <div className="flex items-center space-x-2 text-brand-400 mb-2">
            <CalendarDays size={20} />
            <span className="font-semibold text-sm">Frequência</span>
          </div>
          <p className="text-2xl font-bold text-white">{weeklyExecs.length}</p>
          <p className="text-xs text-zinc-500 mt-1">treinos nos últimos 7 dias</p>
        </div>
        
        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
          <div className="flex items-center space-x-2 text-green-400 mb-2">
            <Activity size={20} />
            <span className="font-semibold text-sm">Total Concluído</span>
          </div>
          <p className="text-2xl font-bold text-white">{execucoes.filter(e => e.status === 'concluido').length}</p>
          <p className="text-xs text-zinc-500 mt-1">desde o início</p>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center"><History className="mr-2" size={20}/> Histórico Recente</h3>
        <div className="space-y-3">
          {execucoes.slice(0, 5).map(exec => {
             const treinoNome = treinos.find(t => t.id === exec.treinoId)?.nome || 'Treino Excluído';
             return (
               <div 
                 key={exec.id} 
                 onClick={() => setSelectedExec(exec)}
                 className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex justify-between items-center cursor-pointer hover:border-zinc-700 transition-colors active:scale-[0.98]"
               >
                 <div>
                   <p className="font-medium text-white">{treinoNome}</p>
                   {/* Fixed: using native Date constructor instead of parseISO */}
                   <p className="text-xs text-zinc-400">{format(new Date(exec.data), "d 'de' MMMM, HH:mm", { locale: ptBR })}</p>
                 </div>
                 <div>
                   {exec.status === 'concluido' ? (
                     <span className="bg-green-900/30 text-green-400 px-2 py-1 rounded text-xs border border-green-800/50">Completo</span>
                   ) : (
                     <span className="bg-orange-900/30 text-orange-400 px-2 py-1 rounded text-xs border border-orange-800/50">Incompleto</span>
                   )}
                 </div>
               </div>
             )
          })}
          {execucoes.length === 0 && (
            <p className="text-zinc-500 text-sm text-center py-4">Nenhum treino realizado ainda.</p>
          )}
        </div>
      </div>

      {/* MODAL DE DETALHES DO TREINO */}
      {selectedExec && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 w-full max-w-md rounded-[32px] border border-zinc-800 p-6 shadow-2xl animate-in zoom-in-95 duration-300 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-black text-white">
                  {treinos.find(t => t.id === selectedExec.treinoId)?.nome || 'Treino'}
                </h3>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mt-1">
                  {format(new Date(selectedExec.data), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
              <button 
                onClick={() => setSelectedExec(null)}
                className="p-2 bg-zinc-800 text-zinc-400 rounded-full hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
              {selectedExec.exerciciosExecutados.map((exExec, idx) => {
                const ex = exercicios[exExec.exercicioId];
                const seriesConcluidas = exExec.series.filter(s => s.concluida).length;
                const totalSeries = exExec.series.length;
                
                return (
                  <div key={idx} className="bg-zinc-950 border border-zinc-800/50 rounded-2xl p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-white text-sm truncate">{ex?.nome || 'Exercício'}</h4>
                        <p className="text-[10px] text-zinc-500 uppercase font-black">{ex?.grupoMuscular}</p>
                      </div>
                      <div className="flex items-center space-x-2 ml-3">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${exExec.concluido ? 'bg-green-900/20 text-green-500 border-green-800/30' : 'bg-orange-900/20 text-orange-500 border-orange-800/30'}`}>
                          {seriesConcluidas}/{totalSeries} SÉRIES
                        </span>
                        {exExec.concluido ? (
                          <CheckCircle2 size={16} className="text-green-500" />
                        ) : (
                          <Circle size={16} className="text-orange-500" />
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {exExec.series.map((s, sIdx) => (
                        <div key={sIdx} className={`text-[10px] p-2 rounded-lg border flex justify-between items-center ${s.concluida ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-900/30 border-zinc-800/30 text-zinc-600'}`}>
                          <span className="font-black">S{s.numero}</span>
                          <span>{s.peso}{ex?.unidadePrincipal || 'kg'} × {s.reps}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-6 border-t border-zinc-800">
              <div className="flex justify-between items-center mb-4">
                <span className="text-zinc-500 text-xs font-bold uppercase">Status Final</span>
                {selectedExec.status === 'concluido' ? (
                  <span className="text-green-500 font-black text-sm uppercase tracking-widest">Completo</span>
                ) : (
                  <span className="text-orange-500 font-black text-sm uppercase tracking-widest">Incompleto</span>
                )}
              </div>
              <button 
                onClick={() => setSelectedExec(null)}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-2xl transition-all active:scale-95"
              >
                FECHAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
