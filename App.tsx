import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { ExercisesList } from './pages/exercises/ExercisesList';
import { ExerciseForm } from './pages/exercises/ExerciseForm';
import { WorkoutsList } from './pages/workouts/WorkoutsList';
import { WorkoutForm } from './pages/workouts/WorkoutForm';
import { ActiveWorkout } from './pages/execution/ActiveWorkout';
import { Reports } from './pages/Reports';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      
      {/* Rotas protegidas dentro do Layout */}
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/perfil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      
      <Route path="/exercicios" element={<ProtectedRoute><ExercisesList /></ProtectedRoute>} />
      <Route path="/exercicios/novo" element={<ProtectedRoute><ExerciseForm /></ProtectedRoute>} />
      <Route path="/exercicios/editar/:id" element={<ProtectedRoute><ExerciseForm /></ProtectedRoute>} />
      
      <Route path="/treinos" element={<ProtectedRoute><WorkoutsList /></ProtectedRoute>} />
      <Route path="/treinos/novo" element={<ProtectedRoute><WorkoutForm /></ProtectedRoute>} />
      <Route path="/treinos/editar/:id" element={<ProtectedRoute><WorkoutForm /></ProtectedRoute>} />
      
      {/* Tela de execução - Tela cheia sem layout lateral */}
      <Route path="/execucao/:id" element={
        user ? (
          <div className="min-h-screen bg-black text-zinc-100 p-4">
             <ActiveWorkout />
          </div>
        ) : <Navigate to="/login" replace />
      } />
      
      {/* Fallback para home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}