import React from 'react';
import { NotificationToast } from './NotificationToast';

interface ToastContainerProps {
  children?: React.ReactNode;
}

/**
 * ToastContainer: Contenedor unificado de notificaciones flotantes.
 * Asegura un layout con 'flex flex-col gap-2' para apilar alertas limpiamente sin sobreponerse.
 */
export const ToastContainer: React.FC<ToastContainerProps> = ({ children }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm sm:max-w-md w-full pointer-events-none">
      {/* Toast de eventos del sistema / realtime */}
      <NotificationToast />
      {/* Contenido dinámico adicional (como avisos de deshacer con puntero activo) */}
      {children}
    </div>
  );
};
