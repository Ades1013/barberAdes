import React from 'react';
import { Scissors, QrCode, MessageSquare, Heart } from 'lucide-react';
import { User } from '../types';

interface FooterProps {
  user: User | null;
  role: 'client' | 'barber';
  isDarkMode: boolean;
  theme: string;
  isAnyModalOpen: boolean;
  onOpenQrModal: () => void;
  onOpenFeedback: (tab: 'feedback' | 'support') => void;
}

export const Footer: React.FC<FooterProps> = ({
  user,
  role,
  isDarkMode,
  theme,
  isAnyModalOpen,
  onOpenQrModal,
  onOpenFeedback,
}) => {
  const hasActiveSession = Boolean(user && user.id);

  return (
    <footer
      className={`relative z-10 w-full shrink-0 border-t ${
        theme === 'light' ? 'bg-white/95 border-slate-200' : 'bg-[#090b0e]/95 border-slate-800/80'
      } backdrop-blur-sm mt-auto py-8 transition-colors`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        {/* Brand Left - Siempre visible */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md shadow-amber-950/40">
            <Scissors
              className={`w-4 h-4 -rotate-45 transition-colors ${isDarkMode ? 'text-black' : 'text-white'}`}
              style={{ color: isDarkMode ? '#000000' : '#FFFFFF', stroke: isDarkMode ? '#000000' : '#FFFFFF' }}
            />
          </div>
          <span className="text-base tracking-tight font-['Plus_Jakarta_Sans',sans-serif] brand-wordmark-title">
            <span className="text-white font-bold">Barber</span><span className="text-amber-500 font-extrabold">Ades</span>
          </span>
        </div>

        {/* Centered Actions: Solo se renderiza el grupo interno de botones si hay una sesión activa */}
        {hasActiveSession && (
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 my-2 sm:my-0">
            {role === 'barber' && (
              <button
                type="button"
                onClick={onOpenQrModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-amber-500/40 text-xs font-semibold transition-all shadow-xs cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5 text-amber-400" />
                <span>Mi Código QR</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenFeedback('feedback')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-amber-500/40 text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
              <span>Sugerencias</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenFeedback('support')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-amber-500/40 text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500/30" />
              <span>Apoyar proyecto</span>
            </button>
          </div>
        )}

        {/* Legal Rights Right - Siempre visible */}
        <div className="text-slate-500 text-xs text-center sm:text-right shrink-0">
          © 2026 BarberAdes · Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
};
export default Footer;
