import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  User,
  ShieldCheck,
  Mail,
  Phone,
  Calendar,
  Scissors,
  Clock,
  MapPin,
  CheckCircle2,
  History,
  ExternalLink,
  MessageCircle,
  AlertCircle,
  Ban,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { Appointment, Barber, Service } from '../../types';
import { formatDateLabel, formatTimeTo12h, formatCurrency, normalizeTimeTo24h } from '../../utils/dateUtils';
import { storageService } from '../../services/storageService';
import { supabase } from '../../services/supabaseClient';

interface ClientProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: {
    id?: string;
    name: string;
    email?: string;
    phone?: string;
    avatarColor?: string;
    appointment?: Appointment;
    appointmentDate?: string;
    appointmentTime?: string;
    appointmentStatus?: string;
    cancelledBy?: string;
  } | null;
  appointments: Appointment[];
  barbers: Barber[];
  services: Service[];
  isBarberViewing?: boolean;
  currentBarberId?: string;
}

export const ClientProfileModal: React.FC<ClientProfileModalProps> = ({
  isOpen,
  onClose,
  client,
  appointments,
  barbers,
  services,
  isBarberViewing = false,
  currentBarberId = 'b-1',
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [isProcessingBlock, setIsProcessingBlock] = useState(false);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);

  // Correo real vinculado a la cita o al cliente (nunca vacío si fue creada por un usuario registrado)
  const cleanEmail = useMemo(() => {
    if (client?.email && client.email.trim()) {
      return client.email.trim().toLowerCase();
    }
    if (client?.id) {
      const match = appointments.find(
        (a) =>
          (a.clientId === client.id || (a as any).client_id === client.id) &&
          Boolean(a.clientEmail || (a as any).client_email)
      );
      if (match) return (match.clientEmail || (match as any).client_email).trim().toLowerCase();
    }
    if (client?.name) {
      const match = appointments.find(
        (a) =>
          a.clientName?.toLowerCase().trim() === client.name?.toLowerCase().trim() &&
          Boolean(a.clientEmail || (a as any).client_email)
      );
      if (match) return (match.clientEmail || (match as any).client_email).trim().toLowerCase();
    }
    return '';
  }, [client, appointments]);

  const [profileData, setProfileData] = useState<{ name?: string; phone?: string } | null>(null);

  useEffect(() => {
    if (!cleanEmail) return;
    try {
      const raw = localStorage.getItem(`barbersync_profile_data_${cleanEmail}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        setProfileData(parsed);
      }
    } catch {}

    supabase
      .from('profiles')
      .select('name, phone')
      .eq('email', cleanEmail)
      .maybeSingle()
      .then(({ data }) => {
        if (data && (data.name || data.phone)) {
          setProfileData(data);
        }
      });
  }, [cleanEmail]);

  const effectiveClientName = profileData?.name || client?.name || 'Cliente';
  const effectiveClientPhone = profileData?.phone || client?.phone;

  const [blockStats, setBlockStats] = useState(() =>
    storageService.getClientBlockCount(cleanEmail)
  );

  const isBlockedByCurrent = useMemo(() => {
    return blockStats.isBlockedByCurrent(currentBarberId);
  }, [blockStats, currentBarberId]);

  useEffect(() => {
    setBlockStats(storageService.getClientBlockCount(cleanEmail));
  }, [cleanEmail, isOpen]);

  const handleToggleBlock = async () => {
    if (!cleanEmail) return;
    if (!isBlockedByCurrent && !blockRestriction.allowed) {
      if (blockRestriction.reason) {
        setBlockMessage(blockRestriction.reason);
      }
      return;
    }
    setIsProcessingBlock(true);
    setBlockMessage(null);

    try {
      if (isBlockedByCurrent) {
        await storageService.unblockClient(currentBarberId, cleanEmail);
        setBlockMessage('Cliente desbloqueado. Ahora podrá volver a reservar turnos contigo.');
      } else {
        const res = await storageService.blockClient(currentBarberId, cleanEmail);
        if (res.isSuspended) {
          setBlockMessage('Cliente bloqueado. Al acumular 3 bloqueos de distintos barberos, su cuenta ha sido suspendida.');
        } else {
          setBlockMessage(`Cliente bloqueado silenciosamente. Ya no podrá reservar turnos contigo (${res.totalDistinctBarbers} de 3 bloqueos para suspensión global).`);
        }
      }
      setBlockStats(storageService.getClientBlockCount(cleanEmail));
    } catch (err) {
      console.warn('Error toggling client block:', err);
    } finally {
      setIsProcessingBlock(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const clientAppointments = useMemo(() => {
    if (!client) return [];
    const cleanEmail = (client.email || '').trim().toLowerCase();
    const cleanId = (client.id || '').trim();
    const cleanName = (client.name || '').trim().toLowerCase();

    return appointments.filter((apt) => {
      const aptEmail = (apt.clientEmail || (apt as any).client_email || '').trim().toLowerCase();
      const aptId = (apt.clientId || (apt as any).client_id || '').trim();
      const aptName = (apt.clientName || (apt as any).client_name || '').trim().toLowerCase();

      if (cleanEmail && aptEmail && cleanEmail === aptEmail) return true;
      if (cleanId && aptId && cleanId === aptId) return true;
      if (cleanName && aptName && cleanName === aptName) return true;
      return false;
    });
  }, [client, appointments]);

  const targetApt = useMemo(() => {
    if (client?.appointment) return client.appointment;
    if (clientAppointments.length > 0) {
      if (client?.appointmentDate && client?.appointmentTime) {
        const targetTime24 = normalizeTimeTo24h(client.appointmentTime, '00:00');
        const match = clientAppointments.find(
          (a) =>
            (a.date || (a as any).appointment_date) === client.appointmentDate &&
            normalizeTimeTo24h(a.time || (a as any).appointment_time, '00:00') === targetTime24
        );
        if (match) return match;
      }
      return clientAppointments[0];
    }
    return null;
  }, [client, clientAppointments]);

  const blockRestriction = useMemo((): { allowed: boolean; reason: string | null } => {
    // d) Si el cliente YA estaba previamente bloqueado por este barbero, el botón debe permitir 'Desbloquear' normalmente
    if (isBlockedByCurrent) {
      return { allowed: true, reason: null };
    }

    const effStatus = client?.appointmentStatus || targetApt?.status;
    const effDate = String(
      client?.appointmentDate ||
        targetApt?.date ||
        (targetApt as any)?.appointment_date ||
        ''
    ).trim();
    const effTime = String(
      client?.appointmentTime ||
        targetApt?.time ||
        (targetApt as any)?.appointment_time ||
        ''
    ).trim();

    // b) Cita cancelada: Si la cita fue cancelada ('status === "cancelled"' o 'status === "canceled"')
    if (effStatus === 'cancelled' || effStatus === 'canceled') {
      return {
        allowed: false,
        reason: 'No se puede bloquear al usuario de una cita cancelada.',
      };
    }

    // a) Cita aún no cumplida: Comparar fecha Y HORA COMPLETA combinadas (new Date(`${apt.date}T${apt.time}`))
    if (effDate && effTime) {
      try {
        const time24 = normalizeTimeTo24h(effTime, '00:00');
        const aptIsoStr = `${effDate}T${time24}`;
        let aptDateTime = new Date(aptIsoStr);
        if (Number.isNaN(aptDateTime.getTime())) {
          const [year, month, day] = effDate.split('-').map(Number);
          const [hour, min] = time24.split(':').map(Number);
          aptDateTime = new Date(year, month - 1, day, hour || 0, min || 0, 0);
        }
        const now = new Date();
        if (now.getTime() < aptDateTime.getTime()) {
          return {
            allowed: false,
            reason: 'Solo puedes bloquear a un cliente por inasistencia después de la hora programada de su cita.',
          };
        }
      } catch {}
    }

    // c) Solo habilita la acción de bloqueo si la fecha y hora de la cita ya se cumplieron y no fue cancelada
    return { allowed: true, reason: null };
  }, [isBlockedByCurrent, client, targetApt]);

  const activeAppointments = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return clientAppointments
      .filter((a) => {
        const isActiveStatus = a.status === 'confirmed' || a.status === 'in_progress' || (a.status as string) === 'pending';
        return isActiveStatus && a.date >= today;
      })
      .sort((a, b) => {
        const c = a.date.localeCompare(b.date);
        return c !== 0 ? c : a.time.localeCompare(b.time);
      });
  }, [clientAppointments]);

  const completedAppointments = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return clientAppointments
      .filter((a) => a.status === 'completed' || (a.status !== 'cancelled' && a.date < today))
      .sort((a, b) => {
        const c = b.date.localeCompare(a.date);
        return c !== 0 ? c : b.time.localeCompare(a.time);
      });
  }, [clientAppointments]);

  const preferredBarbershop = useMemo(() => {
    if (clientAppointments.length === 0) return null;
    const latest = clientAppointments[0];
    const matchBarber = barbers.find(
      (b) => b.id === latest.barberId || b.name.toLowerCase() === latest.barberName.toLowerCase()
    );
    return {
      barberName: latest.barberName || matchBarber?.name || 'Barbero Oficial',
      shopName: matchBarber?.barbershopName || (matchBarber as any)?.shop_name || 'BarberAdes Studio',
      address: matchBarber?.address || 'Ubicación central',
    };
  }, [clientAppointments, barbers]);

  if (!isOpen || !client) return null;

  const initial = client.name ? client.name.charAt(0).toUpperCase() : 'C';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0d1527] border border-amber-500/40 rounded-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-100 shadow-2xl transition-colors">
        
        {/* ÚNICO CONTENEDOR CON SCROLL */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-5">
          {/* Encabezado libre con scroll */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>{isBarberViewing ? 'Datos Básicos de Contacto' : 'Mi Perfil de Cliente'}</span>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Verificado</span>
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  {isBarberViewing
                    ? 'Información oficial de contacto vinculada al correo de registro del cliente.'
                    : 'Tus datos de cuenta, historial de cortes y reservas vigentes.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tarjeta de Identidad y Contacto del Cliente */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${
                  client.avatarColor || 'from-amber-600 to-amber-800'
                } text-white font-black text-base flex items-center justify-center shrink-0 shadow-md ring-2 ring-amber-500/30`}
              >
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-extrabold text-white truncate">{effectiveClientName}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <span className="text-amber-400 font-semibold">
                    {(client as any).role === 'barber' ? 'Barbero BarberAdes' : 'Cliente BarberAdes'}
                  </span>
                  <span>·</span>
                  <span className="text-slate-500 font-mono text-[11px] truncate">
                    ID: {client.id ? client.id.substring(0, 12) : 'Activo'}
                  </span>
                </div>
              </div>
            </div>

            {/* Campos de Contacto Verificados */}
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1">
                  <Mail className="w-3.5 h-3.5 text-amber-400" />
                  <span>Correo Electrónico (Verificado e Inmutable)</span>
                </label>
                <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-mono text-slate-200">
                  <span className="truncate flex-1 select-all">{cleanEmail || 'Sin correo registrado'}</span>
                  {isBarberViewing ? (
                    <button
                      type="button"
                      onClick={handleToggleBlock}
                      disabled={isProcessingBlock || !cleanEmail || (!isBlockedByCurrent && !blockRestriction.allowed)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shrink-0 shadow-xs ${
                        !isBlockedByCurrent && !blockRestriction.allowed
                          ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500 border border-slate-700'
                          : isBlockedByCurrent
                          ? 'cursor-pointer text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30'
                          : 'cursor-pointer text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30'
                      }`}
                      title={
                        isBlockedByCurrent
                          ? 'Desbloquear cliente'
                          : !blockRestriction.allowed
                          ? blockRestriction.reason || 'Solo puedes bloquear a un cliente por inasistencia después de la hora programada de su cita.'
                          : 'Bloquear cliente por correo'
                      }
                    >
                      {isProcessingBlock ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isBlockedByCurrent ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Ban className="w-3.5 h-3.5" />
                      )}
                      <span>{isBlockedByCurrent ? 'Desbloquear' : 'Bloquear'}</span>
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded">
                      Verificado
                    </span>
                  )}
                </div>
                {isBarberViewing && !isBlockedByCurrent && !blockRestriction.allowed && blockRestriction.reason && (
                  <p className="mt-1.5 text-[11px] text-amber-300 flex items-center gap-1.5 leading-snug">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{blockRestriction.reason}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1">
                  <Phone className="w-3.5 h-3.5 text-amber-400" />
                  <span>WhatsApp / Celular de Contacto</span>
                </label>
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200">
                  <span className="font-mono">{effectiveClientPhone && effectiveClientPhone !== '+57' ? effectiveClientPhone : 'No registrado (Opcional)'}</span>
                </div>
              </div>

              {/* Botones de acción directa para el Barbero: Llamada y WhatsApp */}
              {isBarberViewing && effectiveClientPhone && effectiveClientPhone !== '+57' && (
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <a
                    href={`tel:${effectiveClientPhone.replace(/[^0-9+]/g, '')}`}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <Phone className="w-4 h-4 text-amber-400" />
                    <span>Llamar</span>
                  </a>
                  <a
                    href={`https://wa.me/${effectiveClientPhone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Bloqueo Silencioso de Cliente para Barberos */}
          {isBarberViewing && cleanEmail && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Ban className="w-4 h-4 text-rose-400" />
                  <span>Gestión de Bloqueo de Cliente</span>
                </div>
                {isBlockedByCurrent ? (
                  <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Ban className="w-3 h-3" />
                    <span>Bloqueado por ti</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    Habilitado
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Vinculado al correo oficial: <strong className="text-slate-200 font-mono">{cleanEmail}</strong>. El cliente no recibirá ninguna notificación (bloqueo silencioso).
              </p>
              <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
                <span>
                  Reportes acumulados:{' '}
                  <strong className="text-amber-400 font-mono font-bold">
                    {blockStats.totalDistinctBarbers} / 3
                  </strong>{' '}
                  barberos
                </span>
                {blockStats.isSuspended && (
                  <span className="text-rose-400 font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    <span>Cuenta suspendida</span>
                  </span>
                )}
              </div>
              {!isBlockedByCurrent && !blockRestriction.allowed && blockRestriction.reason && (
                <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{blockRestriction.reason}</span>
                </div>
              )}
              {blockMessage && (
                <p className="text-[11px] text-amber-300 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/30">
                  {blockMessage}
                </p>
              )}
              <button
                type="button"
                disabled={isProcessingBlock || (!isBlockedByCurrent && !blockRestriction.allowed)}
                onClick={handleToggleBlock}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                  !isBlockedByCurrent && !blockRestriction.allowed
                    ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500 border border-slate-700'
                    : isBlockedByCurrent
                    ? 'cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    : 'cursor-pointer bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40'
                }`}
                title={
                  !isBlockedByCurrent && !blockRestriction.allowed
                    ? blockRestriction.reason || 'Bloqueo no permitido'
                    : undefined
                }
              >
                {isProcessingBlock
                  ? 'Procesando...'
                  : isBlockedByCurrent
                  ? 'Desbloquear Cliente'
                  : 'Bloquear Cliente Silenciosamente'}
              </button>
            </div>
          )}

          {/* Historial, Barbería y Estadísticas SOLO para el Cliente en su propio perfil */}
          {!isBarberViewing && (
            <>
              {/* Barbería donde reservó / Preferida */}
              {preferredBarbershop && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Scissors className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] uppercase font-bold text-amber-300 tracking-wider block">
                      Barbería Habitual
                    </span>
                    <p className="text-white font-bold text-sm mt-0.5">{preferredBarbershop.shopName}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-400 text-xs mt-0.5">
                      <span>Barbero: <strong className="text-slate-200">{preferredBarbershop.barberName}</strong></span>
                      {preferredBarbershop.address && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 truncate text-slate-400">
                            <MapPin className="w-3 h-3 text-amber-400" />
                            {preferredBarbershop.address}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* KPI Strip */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block mb-1">Cortes Realizados</span>
                  <span className="text-2xl font-black font-mono text-emerald-400 tabular-nums">
                    {completedAppointments.length}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block mb-1">Turnos Activos</span>
                  <span className="text-2xl font-black font-mono text-amber-400 tabular-nums">
                    {activeAppointments.length}
                  </span>
                </div>
              </div>

              {/* Tabs: Turnos Activos vs Historial de Cortes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('active')}
                      className={`text-xs font-bold pb-2 relative transition-colors ${
                        activeTab === 'active'
                          ? 'text-amber-400 border-b-2 border-amber-400 -mb-[9px]'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Turnos Activos ({activeAppointments.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className={`text-xs font-bold pb-2 relative transition-colors ml-3 ${
                        activeTab === 'history'
                          ? 'text-amber-400 border-b-2 border-amber-400 -mb-[9px]'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Historial de Cortes ({completedAppointments.length})
                    </button>
                  </div>
                </div>

                {/* Tab content */}
                {activeTab === 'active' ? (
                  activeAppointments.length === 0 ? (
                    <div className="p-6 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center text-xs text-slate-400 space-y-1">
                      <Calendar className="w-6 h-6 mx-auto text-slate-600 mb-1" />
                      <p className="font-semibold text-slate-300">No tienes citas activas actualmente</p>
                      <p className="text-[11px] text-slate-500">
                        Selecciona un barbero, servicio y horario en la pantalla principal para agendar.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {activeAppointments.map((apt) => (
                        <div
                          key={apt.id}
                          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-xs truncate">{apt.serviceName}</span>
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                {apt.status === 'confirmed' ? 'Confirmado' : apt.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-slate-300">{formatDateLabel(apt.date)}</span>
                              <span>·</span>
                              <span className="text-amber-400 font-mono font-bold">{formatTimeTo12h(apt.time)}</span>
                              <span>·</span>
                              <span>Barbero: <strong className="text-slate-300">{apt.barberName}</strong></span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Código: {apt.code} · Total: {formatCurrency(Number((apt as any).price ?? (apt as any).service_price ?? apt.servicePrice ?? 0))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  completedAppointments.length === 0 ? (
                    <div className="p-6 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center text-xs text-slate-400 space-y-1">
                      <History className="w-6 h-6 mx-auto text-slate-600 mb-1" />
                      <p className="font-semibold text-slate-300">Aún no hay cortes registrados en el historial</p>
                      <p className="text-[11px] text-slate-500">
                        Los turnos pasados o completados aparecerán listados aquí.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {completedAppointments.map((apt) => (
                        <div
                          key={apt.id}
                          className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-200 text-xs truncate">{apt.serviceName}</span>
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>Completado</span>
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                              <span>{formatDateLabel(apt.date)}</span>
                              <span>·</span>
                              <span className="text-slate-300 font-mono">{formatTimeTo12h(apt.time)}</span>
                              <span>·</span>
                              <span>Con: {apt.barberName}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-xs text-amber-400 tabular-nums">
                              {formatCurrency(Number((apt as any).price ?? (apt as any).service_price ?? apt.servicePrice ?? 0))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>

        {/* PIE DE PÁGINA FIJO */}
        <div className="p-4 bg-[#0d1527] border-t border-slate-800 shrink-0 flex items-center justify-end shadow-lg">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-all shadow-md cursor-pointer"
          >
            {isBarberViewing ? 'Cerrar Contacto' : 'Cerrar Ficha'}
          </button>
        </div>
      </div>
    </div>
  );
};
