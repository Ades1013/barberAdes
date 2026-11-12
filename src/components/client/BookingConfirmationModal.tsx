import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Calendar, User, Scissors, MessageCircle, Download, Copy, Check, X, Tag } from 'lucide-react';
import { Barber, Appointment } from '../../types';
import {
  formatCurrency,
  formatDateLabel,
  formatTimeTo12h,
  formatBookingCode,
  generateWhatsAppLink,
  downloadIcsCalendar,
} from '../../utils/dateUtils';
import confetti from 'canvas-confetti';

interface BookingConfirmationModalProps {
  appointment: Appointment | null;
  onClose: () => void;
  onViewMyBookings?: () => void;
  barbers?: Barber[];
}

export const BookingConfirmationModal: React.FC<BookingConfirmationModalProps> = ({
  appointment,
  onClose,
  onViewMyBookings,
  barbers = [],
}) => {
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (appointment) {
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#f59e0b', '#d97706', '#fbbf24', '#ffffff'],
        });
      } catch {
        // Confetti fallback
      }
    }
  }, [appointment]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  React.useEffect(() => {
    if (appointment) {
      document.body.style.overflow = 'hidden';
    } else if (!document.querySelector('[data-modal-open="true"]')) {
      document.body.style.overflow = '';
    }
    return () => {
      setTimeout(() => {
        if (!document.querySelector('[data-modal-open="true"]')) {
          document.body.style.overflow = '';
        }
      }, 0);
    };
  }, [appointment]);

  if (!appointment) return null;

  // 1. Código de Reserva normalizado a formato #CO - 000000 (o código ISO correspondiente)
  const displayCode = formatBookingCode(appointment.code, 'CO');

  const appointmentForLinks: Appointment = {
    ...appointment,
    code: displayCode,
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(displayCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappUrl = generateWhatsAppLink(appointmentForLinks);

  // 2. Información dinámica del barbero (Seudónimo, especialidad o barbería)
  const barberObj = barbers.find((b) => b.id === appointment.barberId);
  const barberDetail =
    barberObj?.nickname ||
    barberObj?.specialty ||
    barberObj?.barbershopName ||
    'Barbero Profesional';

  // 5. Scroll suave hacia "Tu Próxima Cita"
  const handleViewMyAppointment = () => {
    onClose();
    if (onViewMyBookings) {
      onViewMyBookings();
    }
    setTimeout(() => {
      const el = document.getElementById('tu-proxima-cita');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const modalContent = (
    <div
      data-modal-open="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg max-h-[88dvh] overflow-y-auto bg-[#12151b] border border-amber-500/30 rounded-2xl p-6 sm:p-8 text-slate-100 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">¡Turno Reservado con Éxito!</h2>
          <p className="text-sm text-slate-400 mt-1">
            Tu lugar ya quedó asegurado en tiempo real en la agenda de la barbería.
          </p>
        </div>

        {/* Voucher Ticket */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 mb-6 space-y-4">
          {/* 1. Código de Reserva con prefijo de país y 6 dígitos */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-xs text-slate-400 font-medium">Código de reserva</span>
              <div className="text-lg font-mono font-bold text-amber-400 tracking-wider">
                {displayCode}
              </div>
            </div>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            {/* Servicio */}
            <div>
              <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                <Scissors className="w-3.5 h-3.5 text-amber-400" />
                <span>Servicio</span>
              </div>
              <p className="font-semibold text-slate-200">{appointment.serviceName}</p>
              <p className="text-slate-400">{appointment.serviceDuration} minutos</p>
            </div>

            {/* 2. Barbero con Seudónimo/Especialidad o Barbería dinámica */}
            <div>
              <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>Barbero</span>
              </div>
              <p className="font-semibold text-slate-200">{appointment.barberName}</p>
              <p className="text-amber-400/90 font-medium truncate" title={barberDetail}>
                {barberDetail}
              </p>
            </div>

            {/* 3. Fecha con Hora integrada en primer renglón y YYYY-MM-DD en segundo renglón */}
            <div>
              <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Fecha</span>
              </div>
              <p className="font-semibold text-slate-200">
                {formatDateLabel(appointment.date)} · {formatTimeTo12h(appointment.time)}
              </p>
              <p className="text-slate-400 font-mono text-[11px]">{appointment.date}</p>
            </div>

            {/* 4. Columna Valor (precio en COP con estilo destacado en amarillo/ámbar) */}
            <div>
              <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <span>Valor</span>
              </div>
              <p className="font-semibold text-amber-400 font-mono text-sm tabular-nums">
                {formatCurrency(Number((appointment as any).price ?? (appointment as any).service_price ?? appointment.servicePrice ?? 0))}
              </p>
              <p className="text-slate-400 font-mono text-[11px]">COP</p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>Cliente: <strong className="text-slate-300">{appointment.clientName}</strong></span>
            <span>Tel: <strong className="text-slate-300">{appointment.clientPhone}</strong></span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-lg shadow-emerald-950/30"
          >
            <MessageCircle className="w-4 h-4" />
            Recibir Confirmación por WhatsApp
          </a>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => downloadIcsCalendar(appointmentForLinks, barberObj)}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700 cursor-pointer"
              title="Descargar archivo .ics o abrir en calendario"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              Guardar en Calendario (.ics)
            </button>

            {/* 5. Botón Ver Mi Cita con scrollIntoView hacia Tu Próxima Cita */}
            <button
              type="button"
              onClick={handleViewMyAppointment}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700 hover:border-amber-500/40"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              Ver Mi Cita
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-200 font-medium transition-colors"
          >
            Cerrar y volver al inicio
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

// Alias export for alternate component name BookingSuccessModal
export const BookingSuccessModal = BookingConfirmationModal;
