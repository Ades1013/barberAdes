import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Scissors, Clock, DollarSign } from 'lucide-react';
import { Service, ServiceCategory } from '../../types';
import { formatCurrency } from '../../utils/dateUtils';

export const SERVICE_PRICE_OPTIONS: number[] = [
  10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000,
  55000, 60000, 65000, 70000, 75000, 80000, 85000, 90000, 95000, 100000,
];

export interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (serviceData: {
    id?: string;
    name: string;
    category: ServiceCategory;
    price: number;
    description: string;
    durationMinutes: number;
  }) => Promise<void> | void;
  initialService?: Service | null;
  barberName?: string;
}

export const ServiceModal: React.FC<ServiceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialService,
  barberName,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('corte');
  const [price, setPrice] = useState<number>(20000);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialService) {
      setName(initialService.name || '');
      setCategory(initialService.category || 'corte');
      setPrice(initialService.price || 20000);
      setDescription(initialService.description || '');
    } else {
      setName('');
      setCategory('corte');
      setPrice(20000);
      setDescription('');
    }
  }, [initialService, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (typeof document !== 'undefined') {
        const stillOpen = document.querySelectorAll('[data-modal-open="true"]').length;
        if (stillOpen <= 1) {
          document.body.style.overflow = '';
        }
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({
        id: initialService?.id,
        name: name.trim(),
        category,
        price: Number(price) || 20000,
        description: description.trim() || 'Servicio profesional con acabado de máxima atención en 30 minutos.',
        durationMinutes: 30, // Duración fija estandarizada de 30 min
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Si el precio actual no está en la lista de opciones predefinidas, lo añadimos para que no se pierda
  const priceOptions = SERVICE_PRICE_OPTIONS.includes(price)
    ? SERVICE_PRICE_OPTIONS
    : [...SERVICE_PRICE_OPTIONS, price].sort((a, b) => a - b);

  const modalContent = (
    <div 
      data-modal-open="true"
      className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-[#0f121a] border border-amber-500/40 rounded-2xl w-full max-w-lg shadow-2xl max-h-[88dvh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>{initialService ? 'Editar Servicio' : 'Nuevo Servicio'}</span>
                {barberName && (
                  <span className="text-xs text-amber-400 font-normal">· {barberName}</span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">
                Duración fija estandarizada de 30 minutos por turno.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Nombre del Servicio */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nombre del Servicio <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Corte Clásico Tijera, Perfilado de Barba..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="corte">Corte de Cabello</option>
                <option value="barba">Barba / Afeitado</option>
                <option value="combo">Combo Integral</option>
                <option value="tratamiento">Tratamiento / Cuidado</option>
              </select>
            </div>

            {/* Selector desplegable de Precios (Incrementos de $5.000 COP) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                <span>Precio Oficial (COP) <span className="text-amber-400">*</span></span>
              </label>
              <select
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs font-bold text-amber-400 font-mono focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {priceOptions.map((p) => (
                  <option key={p} value={p} className="bg-slate-950 text-white font-mono">
                    {`$${p.toLocaleString('es-CO')} COP`}
                  </option>
                ))}
              </select>
            </div>

            {/* Duración Oficial */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Duración Oficial</span>
              </label>
              <div className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono flex items-center justify-between">
                <span>30 minutos por turno</span>
                <span className="text-[10px] text-amber-400 font-bold uppercase bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  Fijo Estricto
                </span>
              </div>
            </div>

            {/* Descripción Breve */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Descripción Breve (Opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Ej. Incluye lavado previo, toalla caliente y asesoría de estilo personalizada..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-950/30 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Guardando...' : 'Guardar Servicio'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
