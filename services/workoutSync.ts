// Serviço de sincronização em tempo real entre a aba do app e o Service Worker usando IndexedDB
// Permite que ações executadas no Smartwatch ou na barra de notificações funcionem
// mesmo com o celular bloqueado ou o app em segundo plano.

export interface StoredWorkoutSlot {
  slotIndex: number;
  ids: string[];
  exName: string;
  timerPadrao: number;
  timerAtivo: boolean;
  unidadePrincipal: string;
  unidadeSecundaria: string;
}

export interface StoredWorkoutSession {
  treinoId: string;
  treinoNome: string;
  treino: any;
  allExs: Record<string, any>;
  execucaoData: Record<string, any>;
  activeSlotIndex: number;
  dataInicio: string;
  userId: string;
  activeTimer?: {
    targetEndTime: number;
    duration: number;
    slotIndex: number;
    serieIndex: number;
    exName: string;
    currentSerieNum: number;
    totalSeries: number;
    currentPeso: number;
    currentReps: number;
  } | null;
  lastUpdated: number;
}

const DB_NAME = 'meus_exercicios_live';
const DB_VERSION = 1;
const STORE_NAME = 'session';
const SESSION_KEY = 'current_workout';

export const openWorkoutDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB não suportado'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getStoredWorkoutSession = async (): Promise<StoredWorkoutSession | null> => {
  try {
    const db = await openWorkoutDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SESSION_KEY);
      req.onsuccess = () => {
        resolve(req.result ? (req.result.data as StoredWorkoutSession) : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Erro ao carregar sessão do IndexedDB:', err);
    return null;
  }
};

export const saveStoredWorkoutSession = async (session: StoredWorkoutSession): Promise<boolean> => {
  try {
    const db = await openWorkoutDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ key: SESSION_KEY, data: session, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Erro ao salvar sessão no IndexedDB:', err);
    return false;
  }
};

export const clearStoredWorkoutSession = async (): Promise<boolean> => {
  try {
    const db = await openWorkoutDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(SESSION_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Erro ao limpar sessão no IndexedDB:', err);
    return false;
  }
};
