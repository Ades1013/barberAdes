import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, XCircle, Ban, Unlock, X, Undo2 } from 'lucide-react';
import { RealtimeEvent } from '../types';
import { realtimeService } from '../services/realtimeService';
import { storageService } from '../services/storageService';
import { formatTimeTo12h } from '../utils/dateUtils';

interface ToastItem {
  id: string;
  event: RealtimeEvent;
}

export const NotificationToast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    // Only listen to local actions initiated by the user on this device
    const unsubscribe = realtimeService.subscribeToToasts((event) => {
      const item: ToastItem = {
        id: event.id,
        event,
      };
      setToasts((prev) => [item, ...prev.slice(0, 2)]);

      // Auto dismiss: 8 seconds for cancellation with undo, 4 seconds for others
      const duration = event.type === 'CANCEL_BOOKING' ? 8000 : 4000;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, duration);
    });

    return unsubscribe;
  }, []);

  const handleUndoCancel = async (appointmentId: string, toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
    await storageService.updateAppointmentStatus(appointmentId, 'confirmed');
    realtimeService.emit({
      type: 'STATUS_CHANGE',
      actor: 'barber',
      payload: { appointmentId, status: 'confirmed' },
      message: 'Cancelación deshecha. Turno restaurado.',
    });
  };

  if (toasts.length === 0) return null;

  // Format any military time pattern in the message to 12-hour format and simplify cancellation messages
  const formatToastText = (message: string): string => {
    if (!message) return '';
    const cleaned = message.replace(/\s+por el barbero/gi, '');
    return cleaned.replace(/\b(\d{1,2}:\d{2})(\s*hs)?\b/gi, (_, time) => {
      return formatTimeTo12h(time);
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm sm:max-w-md w-full pointer-events-none">
      {toasts.map(({ id, event }) => {
        const isBooking = event.type === 'NEW_BOOKING';
        const isCancel = event.type === 'CANCEL_BOOKING';
        const isBlock = event.type === 'BLOCK_SLOT';
        const isUnblock = event.type === 'UNBLOCK_SLOT';

        return (
          <div
            key={id}
            className="pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/95 border border-amber-500/40 text-slate-100 shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <div className="shrink-0 mt-0.5">
              {isBooking ? (
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              ) : isCancel ? (
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <XCircle className="w-4 h-4" />
                </div>
              ) : isBlock ? (
                <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center">
                  <Ban className="w-4 h-4" />
                </div>
              ) : isUnblock ? (
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Unlock className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                  <Bell className="w-4 h-4" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  {isBooking
                    ? 'Confirmación'
                    : isCancel
                    ? 'Cancelación'
                    : isBlock
                    ? 'Bloqueo'
                    : isUnblock
                    ? 'Desbloqueo'
                    : 'Actualización'}
                </span>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-200 mt-0.5 leading-snug">
                {formatToastText(event.message)}
              </p>

              {/* Botón accesible de Deshacer para cancelaciones de turno */}
              {isCancel && event.payload?.appointmentId && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleUndoCancel(event.payload.appointmentId, id)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer shadow-sm shadow-amber-950/30"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Deshacer</span>
                  </button>
                  <span className="text-[10px] text-slate-400">Disponible 8s</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== id))}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
              aria-label="Cerrar notificación"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

