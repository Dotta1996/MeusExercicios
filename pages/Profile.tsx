import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { updateUserProfile } from '../services/dbService';
import { Save, LogOut, Volume2, Vibrate, Watch } from 'lucide-react';

const ToggleRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}> = ({ icon, title, description, checked, disabled, onToggle }) => (
  <div className="bg-black/60 border border-zinc-800/80 rounded-2xl p-4 flex items-center justify-between">
    <div className="flex items-start space-x-3 mr-3 min-w-0">
      <div className="text-brand-400 shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-white">{title}</p>
        <p className="text-[11px] text-zinc-400">{description}</p>
      </div>
    </div>
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-0.5 shrink-0 disabled:opacity-50 ${
        checked ? 'bg-emerald-500' : 'bg-zinc-700'
      }`}
    >
      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
  </div>
);

export const Profile: React.FC = () => {
  const { profile, refreshProfile, logout } = useAuth();
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    peso: '',
    altura: ''
  });
  const [saving, setSaving] = useState(false);
  const [savingPref, setSavingPref] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFormData({
        nome: profile.nome || '',
        telefone: profile.telefone || '',
        peso: profile.peso ? profile.peso.toString() : '',
        altura: profile.altura ? profile.altura.toString() : ''
      });
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      await updateUserProfile(profile.uid, {
        nome: formData.nome,
        telefone: formData.telefone,
        peso: parseFloat(formData.peso) || 0,
        altura: parseFloat(formData.altura) || 0
      });
      await refreshProfile();
      alert('Perfil atualizado com sucesso!');
    } catch (error) {
      console.error("Error updating profile", error);
      alert('Erro ao atualizar perfil.');
    } finally {
      setSaving(false);
    }
  };

  const togglePref = async (field: 'somAlertaAtivado' | 'vibracaoAtivada' | 'notificacoesRelogioAtivadas', current: boolean) => {
    if (!profile) return;
    setSavingPref(field);
    try {
      await updateUserProfile(profile.uid, { [field]: !current });
      await refreshProfile();
    } catch (error) {
      console.error("Error updating notification preference", error);
      alert('Erro ao atualizar preferência.');
    } finally {
      setSavingPref(null);
    }
  };

  const somAtivado = profile?.somAlertaAtivado !== false;
  const vibracaoAtivada = profile?.vibracaoAtivada !== false;
  const notificacoesRelogioAtivadas = profile?.notificacoesRelogioAtivadas !== false;

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6">Meu Perfil</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4 bg-zinc-900 p-6 rounded-xl border border-zinc-800">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">E-mail</label>
          <input type="text" disabled value={profile?.email || ''} className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2 text-zinc-500" />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Nome</label>
          <input 
            type="text" 
            value={formData.nome} 
            onChange={e => setFormData({...formData, nome: e.target.value})}
            className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 outline-none" 
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Telefone</label>
          <input 
            type="tel" 
            value={formData.telefone} 
            onChange={e => setFormData({...formData, telefone: e.target.value})}
            className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 outline-none" 
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Peso (kg)</label>
            <input 
              type="number" step="0.1"
              value={formData.peso} 
              onChange={e => setFormData({...formData, peso: e.target.value})}
              className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 outline-none" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Altura (cm)</label>
            <input 
              type="number" 
              value={formData.altura} 
              onChange={e => setFormData({...formData, altura: e.target.value})}
              className="w-full bg-black border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 outline-none" 
            />
          </div>
        </div>

        <button 
          type="submit" disabled={saving}
          className="w-full mt-4 bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3 rounded-lg flex justify-center items-center transition-colors"
        >
          <Save size={20} className="mr-2" />
          {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </form>

      <div className="mt-6 bg-zinc-900 p-6 rounded-xl border border-zinc-800">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Avisos Sonoros e Notificações</h3>
        <p className="text-xs text-zinc-500 mb-4">Controle os alertas durante o treino</p>
        <div className="space-y-3">
          <ToggleRow
            icon={<Volume2 size={18} />}
            title="Som"
            description="Toca um beep ao concluir o descanso (com o app aberto)"
            checked={somAtivado}
            disabled={savingPref === 'somAlertaAtivado'}
            onToggle={() => togglePref('somAlertaAtivado', somAtivado)}
          />
          <ToggleRow
            icon={<Vibrate size={18} />}
            title="Vibração"
            description="Vibra ao concluir séries e descansos"
            checked={vibracaoAtivada}
            disabled={savingPref === 'vibracaoAtivada'}
            onToggle={() => togglePref('vibracaoAtivada', vibracaoAtivada)}
          />
          <ToggleRow
            icon={<Watch size={18} />}
            title="Relógio e Barra de Notificações"
            description="Mostra a próxima série com botões no relógio/notificações"
            checked={notificacoesRelogioAtivadas}
            disabled={savingPref === 'notificacoesRelogioAtivadas'}
            onToggle={() => togglePref('notificacoesRelogioAtivadas', notificacoesRelogioAtivadas)}
          />
        </div>
      </div>

      <button onClick={logout} className="mt-8 w-full flex justify-center items-center py-3 text-red-400 hover:text-red-300 bg-red-950/20 rounded-lg border border-red-900/30">
        <LogOut size={20} className="mr-2" />
        Sair do Aplicativo
      </button>
    </div>
  );
};
