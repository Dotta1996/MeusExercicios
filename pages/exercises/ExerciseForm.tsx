import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { addExercicio, updateExercicio, getExercicios } from '../../services/dbService';
import { Exercicio } from '../../types';

export const ExerciseForm: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const [formData, setFormData] = useState<Omit<Exercicio, 'userId'>>({
    nome: '',
    grupoMuscular: '',
    observacoes: '',
    timerPadrao: 60,
    timerAtivo: true,
    unidadePrincipal: 'kg',
    unidadeSecundaria: 'reps'
  });

  useEffect(() => {
    if (id && user) {
      getExercicios(user.uid).then(data => {
        const ex = data.find(e => e.id === id);
        if (ex) {
          setFormData({
            nome: ex.nome,
            grupoMuscular: ex.grupoMuscular,
            observacoes: ex.observacoes,
            timerPadrao: ex.timerPadrao,
            timerAtivo: ex.timerAtivo,
            unidadePrincipal: ex.unidadePrincipal || 'kg',
            unidadeSecundaria: ex.unidadeSecundaria || 'reps'
          });
        }
      });
    }
  }, [id, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      if (id) {
        await updateExercicio(user.uid, id, formData);
      } else {
        await addExercicio({ ...formData, userId: user.uid });
      }
      navigate('/exercicios');
    } catch (error) {
      console.error("Error saving exercise", error);
      alert("Erro ao salvar.");
    }
  };

  const setPreset = (p: string, s: string) => {
    setFormData({ ...formData, unidadePrincipal: p, unidadeSecundaria: s });
  };

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6">{id ? 'Editar Exercício' : 'Novo Exercício'}</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Nome</label>
          <input 
            type="text" required
            value={formData.nome} 
            onChange={e => setFormData({...formData, nome: e.target.value})}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none" 
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Grupo Muscular</label>
          <input 
            type="text" required
            value={formData.grupoMuscular} 
            onChange={e => setFormData({...formData, grupoMuscular: e.target.value})}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none" 
            placeholder="Ex: Peito, Costas, Pernas"
          />
        </div>

        <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800 space-y-4">
          <label className="block text-sm font-medium text-white mb-2">Unidades de Medida</label>
          
          <div className="flex flex-wrap gap-2 mb-4">
            <button type="button" onClick={() => setPreset('kg', 'reps')} className={`text-[10px] font-bold px-3 py-1.5 rounded-full border ${formData.unidadePrincipal === 'kg' && formData.unidadeSecundaria === 'reps' ? 'bg-brand-600 border-brand-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>ACADEMIA (KG + REPS)</button>
            <button type="button" onClick={() => setPreset('km', 'min')} className={`text-[10px] font-bold px-3 py-1.5 rounded-full border ${formData.unidadePrincipal === 'km' && formData.unidadeSecundaria === 'min' ? 'bg-brand-600 border-brand-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>CORRIDA (KM + MIN)</button>
            <button type="button" onClick={() => setPreset('m', 'seg')} className={`text-[10px] font-bold px-3 py-1.5 rounded-full border ${formData.unidadePrincipal === 'm' && formData.unidadeSecundaria === 'seg' ? 'bg-brand-600 border-brand-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>NATAÇÃO (M + SEG)</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-zinc-500 uppercase mb-1 ml-1">Valor 1 (ex: kg)</label>
              <input 
                type="text" required
                value={formData.unidadePrincipal} 
                onChange={e => setFormData({...formData, unidadePrincipal: e.target.value})}
                className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-brand-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-500 uppercase mb-1 ml-1">Valor 2 (ex: reps)</label>
              <input 
                type="text" required
                value={formData.unidadeSecundaria} 
                onChange={e => setFormData({...formData, unidadeSecundaria: e.target.value})}
                className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-brand-500 outline-none" 
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between bg-zinc-900 p-4 rounded-lg border border-zinc-800">
          <span className="text-sm font-medium text-white">Ativar Timer de Descanso</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={formData.timerAtivo} 
              onChange={e => setFormData({...formData, timerAtivo: e.target.checked})}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
          </label>
        </div>

        {formData.timerAtivo && (
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Tempo Padrão (segundos)</label>
            <input 
              type="number" required min="5" step="5"
              value={formData.timerPadrao} 
              onChange={e => setFormData({...formData, timerPadrao: parseInt(e.target.value)})}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none" 
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Observações (opcional)</label>
          <textarea 
            value={formData.observacoes} 
            onChange={e => setFormData({...formData, observacoes: e.target.value})}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none h-24" 
          />
        </div>

        <div className="pt-4 flex space-x-3">
          <button type="button" onClick={() => navigate('/exercicios')} className="flex-1 bg-zinc-800 text-white py-3 rounded-lg font-medium">
            Cancelar
          </button>
          <button type="submit" className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-3 rounded-lg font-medium shadow-lg shadow-brand-900/50">
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
};
