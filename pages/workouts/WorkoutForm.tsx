import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { addTreino, updateTreino, getTreinos, getExercicios } from '../../services/dbService';
import { Treino, Exercicio, TreinoSlot } from '../../types';
import { Plus, X, Layers, Trash2 } from 'lucide-react';

export const WorkoutForm: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const [nome, setNome] = useState('');
  const [ordem, setOrdem] = useState(1);
  const [esporadico, setEsporadico] = useState(false);
  const [listaExercicios, setListaExercicios] = useState<(string | TreinoSlot)[]>([]);
  
  const [allExercicios, setAllExercicios] = useState<Exercicio[]>([]);
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [combineSelection, setCombineSelection] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      const exs = await getExercicios(user.uid);
      setAllExercicios(exs.sort((a, b) => a.nome.localeCompare(b.nome)));
      
      if (id) {
        const treinos = await getTreinos(user.uid);
        const t = treinos.find(x => x.id === id);
        if (t) {
          setNome(t.nome);
          setOrdem(t.ordemSequencia);
          setEsporadico(!!t.esporadico);
          setListaExercicios(t.listaExercicios || []);
        }
      } else {
        const treinos = await getTreinos(user.uid);
        setOrdem(treinos.length + 1);
      }
    };
    loadData();
  }, [id, user]);

  const addExToTreino = (exId: string) => {
    if (exId) {
      setListaExercicios([...listaExercicios, exId]);
    }
  };

  const addCombined = () => {
    if (combineSelection.length === 2) {
      setListaExercicios([...listaExercicios, { ids: [...combineSelection] }]);
      setCombineSelection([]);
      setShowCombineModal(false);
    }
  };

  const removeSlot = (index: number) => {
    const newArr = [...listaExercicios];
    newArr.splice(index, 1);
    setListaExercicios(newArr);
  };

  const moveSlot = (index: number, dir: number) => {
    if (index + dir < 0 || index + dir >= listaExercicios.length) return;
    const newArr = [...listaExercicios];
    const temp = newArr[index];
    newArr[index] = newArr[index + dir];
    newArr[index + dir] = temp;
    setListaExercicios(newArr);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (listaExercicios.length === 0) {
      alert("Adicione pelo menos um exercício ao treino.");
      return;
    }
    
    const data = {
      nome,
      ordemSequencia: ordem,
      esporadico,
      listaExercicios,
      userId: user.uid
    };

    try {
      if (id) {
        await updateTreino(user.uid, id, data);
      } else {
        await addTreino(data);
      }
      navigate('/treinos');
    } catch (error) {
      console.error("Error saving treino", error);
      alert("Erro ao salvar.");
    }
  };

  return (
    <div className="max-w-md mx-auto pb-8">
      <h2 className="text-2xl font-bold mb-6">{id ? 'Editar Treino' : 'Novo Treino'}</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Nome do Treino</label>
            <input 
              type="text" required
              value={nome} 
              onChange={e => setNome(e.target.value)}
              className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none" 
              placeholder="Ex: Treino A - Superior"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Ordem na Sequência</label>
              <input 
                type="number" required min="1"
                disabled={esporadico}
                value={ordem} 
                onChange={e => setOrdem(parseInt(e.target.value))}
                className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none disabled:opacity-50" 
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center space-x-3 bg-black border border-zinc-700 rounded-lg px-4 py-3 w-full cursor-pointer">
                <input 
                  type="checkbox"
                  checked={esporadico}
                  onChange={e => setEsporadico(e.target.checked)}
                  className="w-5 h-5 rounded border-zinc-700 bg-zinc-900 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-zinc-300">Esporádico</span>
              </label>
            </div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Exercícios</h3>
            <button 
              type="button"
              onClick={() => setShowCombineModal(true)}
              className="text-xs bg-brand-900/30 text-brand-400 border border-brand-800/50 px-3 py-1.5 rounded-lg flex items-center"
            >
              <Layers size={14} className="mr-1.5" /> Combinar (Bi-set)
            </button>
          </div>
          
          <div className="mb-4">
            <select 
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-3 text-white focus:ring-2 focus:ring-brand-500 outline-none"
              onChange={(e) => {
                if(e.target.value) {
                  addExToTreino(e.target.value);
                  e.target.value = ""; 
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>+ Adicionar Único...</option>
              {allExercicios.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.nome} ({ex.grupoMuscular})</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {listaExercicios.map((slot, index) => {
              const isCombined = typeof slot !== 'string';
              const ids = isCombined ? (slot as TreinoSlot).ids : [slot as string];
              
              return (
                <div key={index} className="bg-zinc-900 p-3 rounded-xl border border-zinc-800 flex items-center space-x-3">
                  <div className="flex flex-col space-y-1">
                    <button type="button" onClick={() => moveSlot(index, -1)} disabled={index===0} className="text-zinc-600 disabled:opacity-20">▲</button>
                    <button type="button" onClick={() => moveSlot(index, 1)} disabled={index===listaExercicios.length-1} className="text-zinc-600 disabled:opacity-20">▼</button>
                  </div>
                  
                  <div className="flex-1">
                    {ids.map((exId, i) => {
                      const ex = allExercicios.find(e => e.id === exId);
                      return (
                        <div key={exId} className={`${i > 0 ? 'mt-2 pt-2 border-t border-zinc-800' : ''}`}>
                          <p className="font-bold text-white text-sm">{ex?.nome}</p>
                          <p className="text-[10px] text-zinc-500 uppercase font-black">{ex?.grupoMuscular}</p>
                        </div>
                      )
                    })}
                    {isCombined && <span className="inline-block mt-2 bg-brand-900/30 text-brand-500 text-[8px] font-black px-1.5 py-0.5 rounded border border-brand-800/50 uppercase">Combinado</span>}
                  </div>

                  <button type="button" onClick={() => removeSlot(index)} className="p-2 text-zinc-600 hover:text-red-400">
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-4 flex space-x-3">
          <button type="button" onClick={() => navigate('/treinos')} className="flex-1 bg-zinc-800 text-white py-3 rounded-lg font-medium">
            Cancelar
          </button>
          <button type="submit" className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-3 rounded-lg font-medium shadow-lg shadow-brand-900/50">
            Salvar Treino
          </button>
        </div>
      </form>

      {/* Modal para combinar exercícios */}
      {showCombineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 w-full max-w-sm rounded-3xl border border-zinc-800 p-6 shadow-2xl">
            <h3 className="text-xl font-black text-white mb-4">Combinar Exercícios</h3>
            <p className="text-xs text-zinc-500 mb-6">Selecione dois exercícios para executá-los em sequência (Bi-set).</p>
            
            <div className="space-y-4">
              {[0, 1].map(i => (
                <div key={i}>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Exercício {i+1}</label>
                  <select 
                    value={combineSelection[i] || ""}
                    onChange={e => {
                      const newSel = [...combineSelection];
                      newSel[i] = e.target.value;
                      setCombineSelection(newSel);
                    }}
                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Selecionar...</option>
                    {allExercicios.map(ex => (
                      <option key={ex.id} value={ex.id} disabled={combineSelection.includes(ex.id!)}>{ex.nome}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-8 flex space-x-3">
              <button 
                onClick={() => {setShowCombineModal(false); setCombineSelection([]);}}
                className="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm"
              >
                Cancelar
              </button>
              <button 
                disabled={combineSelection.length < 2 || !combineSelection[0] || !combineSelection[1]}
                onClick={addCombined}
                className="flex-1 bg-brand-600 disabled:opacity-30 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-brand-900/40"
              >
                Combinar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};