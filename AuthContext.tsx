import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { UserProfile } from './types';

interface AuthContextType {
  user: { uid: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ uid: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'Users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(data);
        setUser({ uid: data.uid });
        localStorage.setItem('meusex_user_id', data.uid);
      }
    } catch (error) {
      console.error("Erro ao buscar perfil:", error);
    }
  };

  const login = async (email: string, senha: string) => {
    setLoading(true);
    try {
      const emailLower = email.toLowerCase().trim();
      const usersRef = collection(db, 'Users');
      const q = query(usersRef, where('email', '==', emailLower));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // Usuário existe
        const userDoc = querySnapshot.docs[0];
        const data = userDoc.data() as UserProfile;
        
        // Verificação manual da senha
        if (data.senha === senha) {
          setUser({ uid: data.uid });
          setProfile(data);
          localStorage.setItem('meusex_user_id', data.uid);
        } else {
          throw new Error("Senha incorreta.");
        }
      } else {
        // Criar novo usuário
        const newUid = 'u_' + Math.random().toString(36).substr(2, 9);
        const newProfile: UserProfile = {
          uid: newUid,
          email: emailLower,
          senha: senha, // Salva a senha no primeiro acesso
          nome: '',
          telefone: '',
          peso: 0,
          altura: 0,
          ultimoTreinoRealizado: null,
          dataCadastro: new Date().toISOString(),
        };
        await setDoc(doc(db, 'Users', newUid), newProfile);
        setUser({ uid: newUid });
        setProfile(newProfile);
        localStorage.setItem('meusex_user_id', newUid);
      }
    } catch (error: any) {
      console.error("Erro no login manual:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setProfile(null);
    localStorage.removeItem('meusex_user_id');
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.uid);
    }
  };

  useEffect(() => {
    const savedUid = localStorage.getItem('meusex_user_id');
    if (savedUid) {
      fetchProfile(savedUid).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, refreshProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
