import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Exercicio, Treino, ExecucaoTreino, UserProfile, SessaoAtiva } from '../types';

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  try {
    const cached = localStorage.getItem('meusex_user_profile');
    if (cached) {
      const parsed = JSON.parse(cached);
      localStorage.setItem('meusex_user_profile', JSON.stringify({ ...parsed, ...data }));
    }
  } catch (e) {}
  const docRef = doc(db, 'Users', uid);
  await updateDoc(docRef, data);
};

// Helper para gerenciar dados em documento único por usuário com persistência e cache offline
const getUserData = async <T>(collectionName: string, userId: string): Promise<T[]> => {
  const cacheKey = `meusex_cache_${collectionName}_${userId}`;
  try {
    const docRef = doc(db, collectionName, userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const items = (docSnap.data().items || []) as T[];
      try {
        localStorage.setItem(cacheKey, JSON.stringify(items));
      } catch (e) {}
      return items;
    }
    return [];
  } catch (error) {
    console.warn(`[Firestore Offline] Carregando ${collectionName} do armazenamento local:`, error);
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        return JSON.parse(cached) as T[];
      }
    } catch (e) {}
    return [];
  }
};

const saveUserData = async <T>(collectionName: string, userId: string, items: T[]) => {
  const cacheKey = `meusex_cache_${collectionName}_${userId}`;
  try {
    localStorage.setItem(cacheKey, JSON.stringify(items));
  } catch (e) {}
  const docRef = doc(db, collectionName, userId);
  await setDoc(docRef, { items }, { merge: true });
};

// --- Sessão Ativa ---
export const saveSessaoAtiva = async (sessao: SessaoAtiva) => {
  try {
    localStorage.setItem(`meusex_sessao_ativa_${sessao.userId}`, JSON.stringify(sessao));
  } catch (e) {}
  const docRef = doc(db, 'SessoesAtivas', sessao.userId);
  await setDoc(docRef, sessao);
};

export const getSessaoAtiva = async (userId: string): Promise<SessaoAtiva | null> => {
  try {
    const docRef = doc(db, 'SessoesAtivas', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as SessaoAtiva;
      try {
        localStorage.setItem(`meusex_sessao_ativa_${userId}`, JSON.stringify(data));
      } catch (e) {}
      return data;
    }
    return null;
  } catch (error) {
    console.warn("[Firestore Offline] Tentando ler sessão ativa do cache local:", error);
    try {
      const cached = localStorage.getItem(`meusex_sessao_ativa_${userId}`);
      if (cached) {
        return JSON.parse(cached) as SessaoAtiva;
      }
    } catch (e) {}
    return null;
  }
};

export const deleteSessaoAtiva = async (userId: string) => {
  try {
    localStorage.removeItem(`meusex_sessao_ativa_${userId}`);
  } catch (e) {}
  const docRef = doc(db, 'SessoesAtivas', userId);
  await deleteDoc(docRef);
};

// --- Exercícios ---
export const getExercicios = async (userId: string): Promise<Exercicio[]> => {
  return await getUserData<Exercicio>('Exercicios', userId);
};

export const addExercicio = async (data: Omit<Exercicio, 'id'>) => {
  const items = await getExercicios(data.userId);
  const newItem = { ...data, id: Date.now().toString() + Math.random().toString(36).substring(2, 9) } as Exercicio;
  await saveUserData('Exercicios', data.userId, [...items, newItem]);
  return newItem;
};

export const updateExercicio = async (userId: string, id: string, data: Partial<Exercicio>) => {
  const items = await getExercicios(userId);
  const newItems = items.map(item => item.id === id ? { ...item, ...data } : item);
  await saveUserData('Exercicios', userId, newItems);
};

export const deleteExercicio = async (userId: string, id: string) => {
  const items = await getExercicios(userId);
  const newItems = items.filter(item => item.id !== id);
  await saveUserData('Exercicios', userId, newItems);
};

// --- Treinos ---
export const getTreinos = async (userId: string): Promise<Treino[]> => {
  const treinos = await getUserData<Treino>('Treinos', userId);
  return treinos.sort((a, b) => a.ordemSequencia - b.ordemSequencia);
};

export const addTreino = async (data: Omit<Treino, 'id'>) => {
  const items = await getTreinos(data.userId);
  const newItem = { ...data, id: Date.now().toString() + Math.random().toString(36).substring(2, 9) } as Treino;
  await saveUserData('Treinos', data.userId, [...items, newItem]);
  return newItem;
};

export const updateTreino = async (userId: string, id: string, data: Partial<Treino>) => {
  const items = await getTreinos(userId);
  const newItems = items.map(item => item.id === id ? { ...item, ...data } : item);
  await saveUserData('Treinos', userId, newItems);
};

export const deleteTreino = async (userId: string, id: string) => {
  const items = await getTreinos(userId);
  const newItems = items.filter(item => item.id !== id);
  await saveUserData('Treinos', userId, newItems);
};

// --- Execuções Mensais ---
// Gerenciamento de treinos gravados por mês (Documento único por mês por usuário: ExecucoesTreino/${userId}_${yyyy-MM})
// Isso reduz drasticamente as leituras do Firestore, limitando as buscas ao mês corrente e anterior.

export const getYearMonthKey = (dateInput?: Date | string | number): string => {
  const d = dateInput ? new Date(dateInput) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Cache em memória para evitar leituras repetidas durante a navegação
const monthlyCache = new Map<string, ExecucaoTreino[]>();

export const invalidateMonthlyCache = (userId?: string) => {
  if (userId) {
    for (const key of monthlyCache.keys()) {
      if (key.startsWith(`${userId}_`)) {
        monthlyCache.delete(key);
      }
    }
  } else {
    monthlyCache.clear;
  }
};

// Migra execuções que porventura estejam no formato antigo (documento único sem divisão mensal)
const migrateLegacyExecucoes = async (userId: string, legacyItems: ExecucaoTreino[]) => {
  try {
    const grouped: Record<string, ExecucaoTreino[]> = {};
    for (const item of legacyItems) {
      const ym = getYearMonthKey(item.data);
      if (!grouped[ym]) grouped[ym] = [];
      grouped[ym].push(item);
    }

    for (const [ym, items] of Object.entries(grouped)) {
      const monthDocRef = doc(db, 'ExecucoesTreino', `${userId}_${ym}`);
      const snap = await getDoc(monthDocRef);
      let existing: ExecucaoTreino[] = [];
      if (snap.exists()) {
        existing = (snap.data().items || []) as ExecucaoTreino[];
      }
      const existingIds = new Set(existing.map(e => e.id));
      const combined = [...existing];
      for (const it of items) {
        if (!existingIds.has(it.id)) {
          combined.push(it);
        }
      }
      combined.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      await setDoc(monthDocRef, {
        userId,
        anoMes: ym,
        items: combined,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      monthlyCache.set(`${userId}_${ym}`, combined);
    }
    // Remove o documento legado antigo para evitar futuras migrações
    await deleteDoc(doc(db, 'ExecucoesTreino', userId));
  } catch (err) {
    console.warn("Aviso durante migração de execuções antigas:", err);
  }
};

// Busca execuções de um mês específico (Ex: "2026-09") -> 1 leitura no Firestore
export const getExecucoesMes = async (userId: string, yearMonth: string): Promise<ExecucaoTreino[]> => {
  const cacheKey = `${userId}_${yearMonth}`;
  if (monthlyCache.has(cacheKey)) {
    return monthlyCache.get(cacheKey)!;
  }

  const localKey = `meusex_execs_${userId}_${yearMonth}`;
  try {
    const docRef = doc(db, 'ExecucoesTreino', `${userId}_${yearMonth}`);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const items = (docSnap.data().items || []) as ExecucaoTreino[];
      items.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      monthlyCache.set(cacheKey, items);
      try {
        localStorage.setItem(localKey, JSON.stringify(items));
      } catch (e) {}
      return items;
    }
  } catch (err) {
    console.warn(`[Firestore Offline] Buscando histórico do mês ${yearMonth} no cache local:`, err);
    try {
      const cached = localStorage.getItem(localKey);
      if (cached) {
        const items = JSON.parse(cached) as ExecucaoTreino[];
        monthlyCache.set(cacheKey, items);
        return items;
      }
    } catch (e) {}
  }

  // Verifica se ainda existem dados no documento legado ExecucoesTreino/{userId}
  try {
    const legacyDocRef = doc(db, 'ExecucoesTreino', userId);
    const legacySnap = await getDoc(legacyDocRef);
    if (legacySnap.exists()) {
      const legacyItems = (legacySnap.data().items || []) as ExecucaoTreino[];
      if (legacyItems.length > 0) {
        await migrateLegacyExecucoes(userId, legacyItems);
        const docRef = doc(db, 'ExecucoesTreino', `${userId}_${yearMonth}`);
        const recheckSnap = await getDoc(docRef);
        if (recheckSnap.exists()) {
          const items = (recheckSnap.data().items || []) as ExecucaoTreino[];
          items.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
          monthlyCache.set(cacheKey, items);
          return items;
        }
      }
    }
  } catch (e) {
    console.warn("Verificação legada:", e);
  }

  monthlyCache.set(cacheKey, []);
  return [];
};

// Adiciona nova execução gravando no documento do mês correspondente -> 1 leitura + 1 gravação
export const addExecucao = async (data: Omit<ExecucaoTreino, 'id'>) => {
  const newItem = { 
    ...data, 
    id: Date.now().toString() + Math.random().toString(36).substring(2, 9) 
  } as ExecucaoTreino;

  const ym = getYearMonthKey(newItem.data);
  const cacheKey = `${data.userId}_${ym}`;

  const currentMonthItems = await getExecucoesMes(data.userId, ym);
  const updatedItems = [newItem, ...currentMonthItems.filter(e => e.id !== newItem.id)];

  const docRef = doc(db, 'ExecucoesTreino', `${data.userId}_${ym}`);
  await setDoc(docRef, {
    userId: data.userId,
    anoMes: ym,
    items: updatedItems,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  monthlyCache.set(cacheKey, updatedItems);

  // Atualiza contador total no perfil do usuário sem precisar ler o banco todo
  try {
    const userRef = doc(db, 'Users', data.userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const currentTotal = userSnap.data().totalTreinosConcluidos || 0;
      await updateDoc(userRef, { 
        totalTreinosConcluidos: currentTotal + (newItem.status === 'concluido' ? 1 : 0),
        ultimoTreinoRealizado: newItem.treinoId
      });
    }
  } catch (e) {
    console.warn("Aviso ao atualizar perfil do usuário:", e);
  }

  return newItem;
};

// Busca execuções dos últimos N meses (padrão 3 meses) para telas que precisam de histórico recente (Relatórios)
export const getExecucoes = async (userId: string, monthsCount = 3): Promise<ExecucaoTreino[]> => {
  const now = new Date();
  const allExecs: ExecucaoTreino[] = [];

  for (let i = 0; i < monthsCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = getYearMonthKey(d);
    const monthExecs = await getExecucoesMes(userId, ym);
    allExecs.push(...monthExecs);
  }

  return allExecs.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
};

// Helper otimizado: busca o histórico anterior de um exercício consultando até 3 meses anteriores
// Como usa cache em memória, para a maioria dos casos lê apenas 1 documento mensal do Firestore!
export const getLastExercicioData = async (userId: string, exercicioId: string) => {
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = getYearMonthKey(targetDate);
    const execs = await getExecucoesMes(userId, ym);

    for (const exec of execs) {
      const found = exec.exerciciosExecutados.find(e => e.exercicioId === exercicioId);
      if (found) {
        if (found.series.some(s => s.concluida)) {
          return found;
        }
      }
    }
  }
  return null;
};

