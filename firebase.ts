import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB1ADYV7V1DFrNNzA2GSASjFFKdEqzPGAQ",
  authDomain: "meus-exercicios-3d1ea.firebaseapp.com",
  projectId: "meus-exercicios-3d1ea",
  storageBucket: "meus-exercicios-3d1ea.firebasestorage.app",
  messagingSenderId: "330194970787",
  appId: "1:330194970787:web:457bbf53aadf00c1a1b716"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
