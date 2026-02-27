import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Exercicio, Treino, ExecucaoTreino, UserProfile, SessaoAtiva } from '../types';

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  const docRef = doc(db, 'Users', uid);
  await updateDoc(docRef, data);
};

// Helper para gerenciar dados em documento único por usuário
const getUserData = async <T>(collectionName: string, userId: string): Promise<T[]> => {
  const docRef = doc(db, collectionName, userId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data().items || [];
  }
  return [];
};

const saveUserData = async <T>(collectionName: string, userId: string, items: T[]) => {
  const docRef = doc(db, collectionName, userId);
  await setDoc(docRef, { items }, { merge: true });
};

// --- Sessão Ativa ---
export const saveSessaoAtiva = async (sessao: SessaoAtiva) => {
  const docRef = doc(db, 'SessoesAtivas', sessao.userId);
  await setDoc(docRef, sessao);
};

export const getSessaoAtiva = async (userId: string): Promise<SessaoAtiva | null> => {
  const docRef = doc(db, 'SessoesAtivas', userId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as SessaoAtiva;
  }
  return null;
};

export const deleteSessaoAtiva = async (userId: string) => {
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

// --- Execuções ---
export const addExecucao = async (data: Omit<ExecucaoTreino, 'id'>) => {
  const items = await getExecucoes(data.userId);
  const newItem = { ...data, id: Date.now().toString() + Math.random().toString(36).substring(2, 9) } as ExecucaoTreino;
  await saveUserData('ExecucoesTreino', data.userId, [...items, newItem]);
  return newItem;
};

export const getExecucoes = async (userId: string): Promise<ExecucaoTreino[]> => {
  const execucoes = await getUserData<ExecucaoTreino>('ExecucoesTreino', userId);
  return execucoes.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
};

// Helper for finding previous execution data for an exercise
export const getLastExercicioData = async (userId: string, exercicioId: string) => {
   const execucoes = await getExecucoes(userId);
   for (const exec of execucoes) {
       const found = exec.exerciciosExecutados.find(e => e.exercicioId === exercicioId);
       if (found) {
           // Se pelo menos uma série foi concluída neste exercício, retornamos o registro completo
           // Isso garante que o número de séries não "encolha" se o usuário deixar alguma pendente
           if (found.series.some(s => s.concluida)) {
               return found;
           }
       }
   }
   return null;
};
