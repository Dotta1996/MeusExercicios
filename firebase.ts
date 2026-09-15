import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB1ADYV7V1DFrNNzA2GSASjFFKdEqzPGAQ",
  authDomain: "meus-exercicios-3d1ea.firebaseapp.com",
  projectId: "meus-exercicios-3d1ea",
  storageBucket: "meus-exercicios-3d1ea.firebasestorage.app",
  messagingSenderId: "330194970787",
  appId: "1:330194970787:web:457bbf53aadf00c1a1b716"
};

const app = initializeApp(firebaseConfig);

// Configuração otimizada para conexões em iframe, webview e redes instáveis:
// 1. experimentalForceLongPolling evita travamento do stream de WebSockets/WebChannel
// 2. persistentLocalCache garante persistência em IndexedDB para funcionamento contínuo mesmo offline
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
