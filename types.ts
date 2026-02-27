export interface UserProfile {
  uid: string;
  nome: string;
  telefone: string;
  email: string;
  senha?: string; // Campo de senha para verificação manual
  peso: number;
  altura: number;
  ultimoTreinoRealizado: string | null;
  dataCadastro: string;
}

export interface Exercicio {
  id?: string;
  userId: string;
  nome: string;
  grupoMuscular: string;
  observacoes: string;
  timerPadrao: number; // in seconds
  timerAtivo: boolean;
  unidadePrincipal?: string; // ex: 'kg', 'km', 'm'
  unidadeSecundaria?: string; // ex: 'reps', 'min', 'seg'
}

export interface TreinoSlot {
  ids: string[];
}

export interface Treino {
  id?: string;
  userId: string;
  nome: string;
  ordemSequencia: number;
  listaExercicios: (string | TreinoSlot)[]; // Pode ser ID string ou objeto com múltiplos IDs
  esporadico?: boolean;
}

export interface SerieExecutada {
  numero: number;
  peso: number;
  reps: number;
  concluida: boolean;
}

export interface ExercicioExecutado {
  exercicioId: string;
  series: SerieExecutada[];
  concluido: boolean;
}

export interface ExecucaoTreino {
  id?: string;
  userId: string;
  treinoId: string;
  data: string; // ISO string
  exerciciosExecutados: ExercicioExecutado[];
  status: 'concluido' | 'incompleto';
}

export interface SessaoAtiva {
  userId: string;
  treinoId: string;
  dataInicio: string;
  execucaoData: Record<string, ExercicioExecutado>;
  activeSlotIndex: number | null;
}