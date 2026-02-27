import React, { useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { getExercicios, deleteExercicio } from '../../services/dbService';
import { Exercicio } from '../../types';
import { Plus, Trash2, Edit2, Clock, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmModal } from '../../components/ConfirmModal';

export const ExercisesList: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exercicios, setExercicios] = useState<Exercicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadExercicios = async () => {
    if (!user) return;
    setLoading(true);
    const data = await getExercicios(user.uid);
    setExercicios(data.sort((a,b) => a.nome.localeCompare(b.nome)));
    setLoading(false);
  };

  useEffect(() => {
    loadExercicios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleDelete = async () => {
    if (deleteId && user) {
      await deleteExercicio(user.uid, deleteId);
      setDeleteId(null);
      loadExercicios();
    }
  };

  if (loading) return <div className="text-center py-8 text-zinc-400">Carregando...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Exercícios</h2>
        <button 
          onClick={() => navigate('/exercicios/novo')}
          className="bg-brand-600 p-2 rounded-full text-white shadow-lg shadow-brand-900/50"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="space-y-3">
        {exercicios.length === 0 ? (
          <p className="text-center text-zinc-500 py-8">Nenhum exercício cadastrado.</p>
        ) : (
          exercicios.map(ex => (
            <div key={ex.id} className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-white">{ex.nome}</h3>
                <div className="flex space-x-3 text-xs text-zinc-400 mt-1">
                  <span>{ex.grupoMuscular}</span>
                  {ex.timerAtivo && (
                    <span className="flex items-center"><Clock size={12} className="mr-1"/> {ex.timerPadrao}s</span>
                  )}
                </div>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => navigate(`/exercicios/editar/${ex.id}`)} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg">
                  <Edit2 size={18} />
                </button>
                <button onClick={() => ex.id && setDeleteId(ex.id)} className="p-2 text-red-400 hover:text-red-300 bg-red-950/30 rounded-lg">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmModal 
        isOpen={!!deleteId}
        title="Excluir Exercício"
        message="Tem certeza que deseja remover este exercício? Ele pode estar vinculado a treinos existentes."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmText="EXCLUIR"
        cancelText="CANCELAR"
      />
    </div>
  );
};
