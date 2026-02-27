
import React, { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { getExecucoes } from '../services/dbService';
import { ExecucaoTreino } from '../types';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
// Fixed: Using native Date methods instead of parseISO and subDays which may be missing from main export
import { format } from 'date-fns';

export const Reports: React.FC = () => {
  const { user } = useAuth();
  const [execucoes, setExecucoes] = useState<ExecucaoTreino[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const execs = await getExecucoes(user.uid);
        setExecucoes(execs || []);
      } catch (err) {
        console.error("Erro ao carregar relatórios:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  if (loading) return <div className="p-8 text-center text-zinc-400 animate-pulse font-medium">Analisando seu desempenho...</div>;

  if (!execucoes || execucoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-zinc-900/30 rounded-3xl border border-zinc-800 border-dashed">
        <div className="bg-zinc-800 p-4 rounded-full mb-4">
          <svg className="w-12 h-12 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Sem dados ainda</h3>
        <p className="text-sm text-zinc-500 max-w-xs">Complete seu primeiro treino para desbloquear os gráficos de evolução.</p>
      </div>
    );
  }

  // 1. Frequência dos últimos 14 dias
  const last14Days = Array.from({length: 14}).map((_, i) => {
    // Fixed: replacing subDays with manual date arithmetic
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return {
      date: format(d, 'dd/MM'),
      count: 0
    };
  });

  execucoes.forEach(e => {
    try {
      // Fixed: using native Date instead of parseISO
      const dStr = format(new Date(e.data), 'dd/MM');
      const day = last14Days.find(d => d.date === dStr);
      if (day) day.count += 1;
    } catch (err) { /* Ignorar datas inválidas */ }
  });

  // 2. Volume Total por Treino (últimos 10)
  const volumeData = [...execucoes]
    .filter(e => e.exerciciosExecutados && Array.isArray(e.exerciciosExecutados))
    .reverse()
    .map(e => {
      let vol = 0;
      e.exerciciosExecutados.forEach(ex => {
        if (ex.series && Array.isArray(ex.series)) {
          ex.series.forEach(s => {
            if (s.concluida) vol += (Number(s.peso || 0) * Number(s.reps || 0));
          });
        }
      });
      return {
        // Fixed: using native Date instead of parseISO
        data: format(new Date(e.data), 'dd/MM'),
        volume: vol
      };
    })
    .slice(-10);

  const totalConcluidos = execucoes.filter(e => e.status === 'concluido').length;
  const taxaConclusao = Math.round((totalConcluidos / execucoes.length) * 100);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col">
        <h2 className="text-2xl font-black text-white tracking-tight">Evolução</h2>
        <p className="text-sm text-zinc-500">Acompanhamento de consistência e carga</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
          </div>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Taxa de Conclusão</p>
          <p className="text-3xl font-black text-brand-500">{taxaConclusao}%</p>
        </div>
        <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path></svg>
          </div>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">Total de Treinos</p>
          <p className="text-3xl font-black text-white">{execucoes.length}</p>
        </div>
      </div>

      <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-xl">
        <h3 className="font-bold text-white mb-6 text-sm flex items-center">
          <span className="w-2 h-2 bg-brand-500 rounded-full mr-2 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
          Frequência (Últimos 14 dias)
        </h3>
        {/* Adicionado min-h para evitar erro de medição do Recharts */}
        <div className="w-full min-h-[224px]">
          <ResponsiveContainer width="100%" height={224}>
            <BarChart data={last14Days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" stroke="#71717a" fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} hide />
              <Tooltip 
                contentStyle={{ backgroundColor: '#09090b', borderRadius: '16px', border: '1px solid #27272a', color: '#fff', fontSize: '12px', padding: '12px' }}
                cursor={{ fill: '#18181b', opacity: 0.4 }}
              />
              <Bar dataKey="count" fill="#10b981" radius={[6, 6, 6, 6]} name="Treinos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-xl">
        <h3 className="font-bold text-white mb-6 text-sm flex items-center">
          <span className="w-2 h-2 bg-green-500 rounded-full mr-2 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
          Volume de Carga Total (kg)
        </h3>
        <div className="w-full min-h-[224px]">
          <ResponsiveContainer width="100%" height={224}>
            <LineChart data={volumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="data" stroke="#71717a" fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ backgroundColor: '#09090b', borderRadius: '16px', border: '1px solid #27272a', color: '#fff', fontSize: '12px', padding: '12px' }}
              />
              <Line 
                type="monotone" 
                dataKey="volume" 
                stroke="#10b981" 
                strokeWidth={4} 
                dot={{ r: 5, fill: '#10b981', strokeWidth: 3, stroke: '#09090b' }} 
                activeDot={{ r: 8, strokeWidth: 0, fill: '#34d399' }}
                name="Volume (kg)" 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
