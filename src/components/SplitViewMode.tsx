import { Barber, Service, Appointment, BlockedSlot, User as UserType } from '../types';
import { ClientBookingFlow } from './client/ClientBookingFlow';
import { BarberDashboard } from './barber/BarberDashboard';
import { SplitSquareVertical, User, Briefcase, Zap, Info } from 'lucide-react';

interface SplitViewModeProps {
  barbers: Barber[];
  services: Service[];
  appointments: Appointment[];
  blockedSlots: BlockedSlot[];
  currentUser: UserType | null;
  onOpenAuthModal: () => void;
  onRefreshData: () => void;
  onBookingComplete: (newAppointment: Appointment) => void;
  onExitSplitView: () => void;
  onModalStateChange?: (isOpen: boolean) => void;
}

export const SplitViewMode: React.FC<SplitViewModeProps> = ({
  barbers,
  services,
  appointments,
  blockedSlots,
  currentUser,
  onOpenAuthModal,
  onRefreshData,
  onBookingComplete,
  onExitSplitView,
  onModalStateChange,
}) => {
  return (
    <div className="space-y-4">
      {/* Interactive Explanation Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 fill-slate-950" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Modo Demostración en Tiempo Real Simultáneo
            </h3>
            <p className="text-xs text-slate-300">
              Prueba reservar un turno a la izquierda y observa cómo la agenda del barbero a la derecha se actualiza al instante sin recargar.
            </p>
          </div>
        </div>

        <button
          onClick={onExitSplitView}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
        >
          Volver a Vista Normal
        </button>
      </div>

      {/* Side-by-Side Dual View */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Left Column: Client Portal */}
        <div className="bg-[#0f1218] border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <span className="font-bold text-white text-sm">Perspectiva: Cliente</span>
            </div>
            <span className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              En Vivo
            </span>
          </div>

          <div className="max-h-[85vh] overflow-y-auto pr-1">
            <ClientBookingFlow
              barbers={barbers}
              services={services}
              appointments={appointments}
              blockedSlots={blockedSlots}
              currentUser={currentUser}
              onOpenAuthModal={onOpenAuthModal}
              onBookingComplete={onBookingComplete}
              onRefreshData={onRefreshData}
            />
          </div>
        </div>

        {/* Right Column: Barber Portal */}
        <div className="bg-[#0f1218] border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Briefcase className="w-4 h-4" />
              </div>
              <span className="font-bold text-white text-sm">Perspectiva: Barbero</span>
            </div>
            <span className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Sincronizado
            </span>
          </div>

          <div className="max-h-[85vh] overflow-y-auto pr-1">
            <BarberDashboard
              barbers={barbers}
              services={services}
              appointments={appointments}
              blockedSlots={blockedSlots}
              currentUser={currentUser}
              onRefreshData={onRefreshData}
              onModalStateChange={onModalStateChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
