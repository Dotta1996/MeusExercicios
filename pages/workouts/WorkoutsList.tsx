import React, { useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { getTreinos, deleteTreino } from '../../services/dbService';
import { Treino } from '../../types';
import { Plus, Trash2, Edit2, MoveVertical, Play, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmModal } from '../../components/ConfirmModal';

export const WorkoutsList: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [treinos, setTreinos] = useState<Treino[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadTreinos = async () => {
    if (!user) return;
    setLoading(true);
    const data = await getTreinos(user.uid);
    setTreinos(data); // Already ordered by ordemSequencia by DB service
    setLoading(false);
  };

  useEffect(() => {
    loadTreinos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleDelete = async () => {
    if (deleteId && user) {
      await deleteTreino(user.uid, deleteId);
      setDeleteId(null);
      loadTreinos();
    }
  };

  if (loading) return <div className="text-center py-8 text-zinc-400">Carregando...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Meus Treinos</h2>
          <p className="text-sm text-zinc-400">Sequência de execução</p>
        </div>
        <button 
          onClick={() => navigate('/treinos/novo')}
          className="bg-brand-600 p-2 rounded-full text-white shadow-lg shadow-brand-900/50"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="space-y-3">
        {treinos.length === 0 ? (
          <p className="text-center text-zinc-500 py-8">Nenhum treino cadastrado.</p>
        ) : (
          treinos.map((t, index) => (
            <div key={t.id} className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex justify-between items-center relative overflow-hidden">
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${t.esporadico ? 'bg-zinc-700' : 'bg-brand-500'}`}></div>
              <div className="flex items-center space-x-3 ml-2">
                <div className="bg-zinc-800 w-8 h-8 rounded-full flex items-center justify-center font-bold text-zinc-300">
                  {t.esporadico ? '★' : index + 1}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold text-white">{t.nome}</h3>
                    {t.esporadico && (
                      <span className="text-[8px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700 uppercase font-black">Esporádico</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">{t.listaExercicios.length} exercícios</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button 
                  onClick={() => navigate(`/execucao/${t.id}`)}
                  className="p-2 text-brand-400 hover:text-brand-300 bg-brand-950/30 rounded-lg"
                  title="Iniciar Treino"
                >
                  <Play size={18} fill="currentColor" />
                </button>
                <button onClick={() => navigate(`/treinos/editar/${t.id}`)} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg">
                  <Edit2 size={18} />
                </button>
                <button onClick={() => t.id && setDeleteId(t.id)} className="p-2 text-red-400 hover:text-red-300 bg-red-950/30 rounded-lg">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      
      {treinos.length > 0 && (
         <div className="mt-6 bg-zinc-900/50 p-4 border border-zinc-800 border-dashed rounded-lg text-sm text-zinc-400 text-center">
            Para alterar a ordem de execução, edite o campo "Ordem na Sequência" dentro de cada treino.
         </div>
      )}

      <ConfirmModal 
        isOpen={!!deleteId}
        title="Excluir Treino"
        message="Tem certeza que deseja remover este treino? Esta ação não pode ser desfeita."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmText="EXCLUIR"
        cancelText="CANCELAR"
      />
    </div>
  );
};
