import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDanger = true,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 w-full max-w-sm rounded-[32px] border border-zinc-800 p-8 shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="flex flex-col items-center text-center">
          <div className={`w-16 h-16 ${isDanger ? 'bg-red-500/20' : 'bg-brand-500/20'} rounded-full flex items-center justify-center mb-6`}>
            <AlertTriangle size={32} className={isDanger ? 'text-red-500' : 'text-brand-500'} />
          </div>
          <h3 className="text-xl font-black text-white mb-2">{title}</h3>
          <p className="text-zinc-400 text-sm mb-8">{message}</p>
          
          <div className="grid grid-cols-2 gap-3 w-full">
            <button 
              onClick={onCancel}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-2xl transition-all active:scale-95"
            >
              {cancelText}
            </button>
            <button 
              onClick={onConfirm}
              className={`${isDanger ? 'bg-red-600 hover:bg-red-500' : 'bg-brand-600 hover:bg-brand-500'} text-white font-black py-4 rounded-2xl shadow-lg transition-all active:scale-95`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
