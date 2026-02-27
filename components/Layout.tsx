import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Dumbbell, ListTodo, User, BarChart3 } from 'lucide-react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: 'Início' },
    { path: '/treinos', icon: ListTodo, label: 'Treinos' },
    { path: '/exercicios', icon: Dumbbell, label: 'Exercícios' },
    { path: '/relatorios', icon: BarChart3, label: 'Evolução' },
    { path: '/perfil', icon: User, label: 'Perfil' },
  ];

  return (
    <div className="flex flex-col h-full bg-black text-zinc-100">
      <header className="bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 p-4 sticky top-0 z-10 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <img src="/icon.svg" alt="Logo" className="w-8 h-8 rounded-lg shadow-lg shadow-brand-500/20" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-brand-500 tracking-tight leading-none">MeusEx</h1>
            <span className="text-[8px] text-zinc-500 font-black uppercase tracking-widest mt-1">Versão 1.2.0</span>
          </div>
        </div>
        {/* Optional: Add status indicators here */}
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24">
        {children}
      </main>

      <nav className="bg-zinc-900/50 backdrop-blur-md border-t border-zinc-800 fixed bottom-0 w-full z-20 env-safe-area-bottom pb-safe">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                  isActive ? 'text-brand-500' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
