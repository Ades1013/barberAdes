import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Heart, Check, Send, Coffee, ShieldCheck, ExternalLink, Sparkles } from 'lucide-react';
import { storageService } from '../../services/storageService';

const PAYMENT_LINK_URL = 'https://checkout.wompi.co/l/VPOS_BarberAdes';

const DONATION_PRESETS = [
  { value: 5000, label: '$5.000 COP', description: 'Café de apoyo' },
  { value: 10000, label: '$10.000 COP', description: 'Impulso mensual' },
  { value: 20000, label: '$20.000 COP', description: 'Pro Partner' },
];

interface FeedbackSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'feedback' | 'support';
  userEmail?: string;
  userRole?: string;
}

export const FeedbackSupportModal: React.FC<FeedbackSupportModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'feedback',
  userEmail,
  userRole,
}) => {
  const [activeTab, setActiveTab] = useState<'feedback' | 'support'>(initialTab);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [selectedAmount, setSelectedAmount] = useState<number>(5000);
  const [sentSuccess, setSentSuccess] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    setActiveTab(initialTab);
    setSentSuccess(false);
    setIsSubmitting(false);
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSendSuggestion = async () => {
    const cleanMsg = feedbackText.trim();
    if (!cleanMsg || isSubmitting) return;

    setIsSubmitting(true);
    await storageService.submitSuggestion(cleanMsg, userEmail, userRole);
    setIsSubmitting(false);
    setSentSuccess(true);
    setFeedbackText('');
    setTimeout(() => {
      setSentSuccess(false);
      onClose();
    }, 2200);
  };

  const handleOpenPayment = () => {
    window.open(PAYMENT_LINK_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#0d131f] border border-amber-500/40 rounded-3xl p-6 text-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tab Selector */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => setActiveTab('feedback')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'feedback'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Sugerencias & Feedback</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('support')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'support'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
            <span>Apoyar Proyecto</span>
          </button>
        </div>

        {activeTab === 'feedback' ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Tu Opinión Mejora BarberAdes</span>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  Directo
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                ¿Qué función te gustaría ver en la app? ¿Hay algo que podamos mejorar en tu flujo de trabajo diario?
              </p>
            </div>

            <textarea
              rows={4}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Ej. Me gustaría poder enviar recordatorios automáticos por SMS o agregar un módulo de inventario..."
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-xs resize-none"
            />

            {sentSuccess ? (
              <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>¡Gracias por tu opinión! Tu sugerencia ha sido enviada con éxito.</span>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/3 py-2.5 px-3 rounded-xl text-xs font-semibold border border-slate-800 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !feedbackText.trim()}
                  onClick={handleSendSuggestion}
                  className="w-2/3 py-2.5 px-3 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Enviando...' : 'Enviar Sugerencia'}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Aporte Voluntario al Proyecto</span>
                <Coffee className="w-4 h-4 text-amber-400" />
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                BarberAdes es un software diseñado para modernizar y facilitar el trabajo de barberos independientes. Si la herramienta aporta valor a tu negocio, puedes apoyar el desarrollo y servidores con un aporte voluntario.
              </p>
            </div>

            {/* Valores sugeridos de aporte */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Selecciona un valor sugerido
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DONATION_PRESETS.map((preset) => {
                  const isSelected = selectedAmount === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setSelectedAmount(preset.value)}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-950/30 ring-1 ring-amber-400/50'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="font-mono font-black text-xs sm:text-sm block">
                        {preset.label}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                        {preset.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Botón principal de pasarela */}
            <button
              type="button"
              onClick={handleOpenPayment}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm transition-all shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Apoyar vía Nequi, PSE o Tarjeta ↗</span>
            </button>

            {/* Nota de seguridad de la transacción Wompi */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-2.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="leading-snug">
                Transacción procesada de forma segura a través de <strong className="text-slate-200">Wompi (Bancolombia)</strong> sin compartir datos sensibles ni exponer cuentas personales.
              </p>
            </div>

            {/* Pie de agradecimiento */}
            <p className="text-center text-xs font-semibold text-amber-400/90 pt-1">
              ¡Muchas gracias por impulsar el crecimiento de BarberAdes!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
