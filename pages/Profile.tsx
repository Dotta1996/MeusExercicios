import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { updateUserProfile } from '../services/dbService';
import { Save, LogOut } from 'lucide-react';

export const Profile: React.FC = () => {
  const { profile, refreshProfile, logout } = useAuth();
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    peso: '',
    altura: ''
  });
  const [saving, setSaving] = useState(false);

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

      <button onClick={logout} className="mt-8 w-full flex justify-center items-center py-3 text-red-400 hover:text-red-300 bg-red-950/20 rounded-lg border border-red-900/30">
        <LogOut size={20} className="mr-2" />
        Sair do Aplicativo
      </button>
    </div>
  );
};
