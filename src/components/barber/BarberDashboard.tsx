import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Barber, Service, Appointment, BlockedSlot, User as UserType } from '../../types';
import { getNextDays, generateDailySlots, formatCurrency, formatDateLabel, formatTimeTo12h, formatScheduleDisplay, TimeSlotStatus, formatBookingCode, normalizeTime, normalizeTimeTo24h, formatPhoneForWhatsApp, hasAppointmentStarted } from '../../utils/dateUtils';
import { storageService, rowToAppointment } from '../../services/storageService';
import { realtimeService } from '../../services/realtimeService';
import { supabase } from '../../services/supabaseClient';
import { BlockSlotModal } from './BlockSlotModal';
import { AddWalkinModal } from './AddWalkinModal';
import { BarberAvailabilitySettings } from './BarberAvailabilitySettings';
import { getSocialDeepLink } from './ProfilePreviewModal';
import {
  Calendar,
  Clock,
  User,
  Scissors,
  DollarSign,
  Plus,
  Ban,
  Settings,
  CheckCircle,
  Play,
  XCircle,
  Phone,
  Unlock,
  Lock,
  AlertCircle,
  Radio,
  Store,
  X,
  Undo2,
  History,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  MapPin,
  Coffee,
  MessageCircle,
  QrCode,
  Heart,
  MessageSquare,
  Bell,
  ArrowUpDown,
} from 'lucide-react';

interface BarberDashboardProps {
  barbers: Barber[];
  services: Service[];
  appointments: Appointment[];
  blockedSlots: BlockedSlot[];
  currentUser?: UserType | null;
  onRefreshData: () => void;
  onOpenBusinessProfile?: () => void;
  onOpenClientProfile?: (client: {
    name: string;
    email?: string;
    phone?: string;
    id?: string;
    appointment?: Appointment;
    appointmentDate?: string;
    appointmentTime?: string;
    appointmentStatus?: string;
    cancelledBy?: string;
  }) => void;
  onModalStateChange?: (isOpen: boolean) => void;
}

export const BarberDashboard: React.FC<BarberDashboardProps> = ({
  barbers,
  services,
  appointments,
  blockedSlots,
  currentUser,
  onRefreshData,
  onOpenBusinessProfile,
  onOpenClientProfile,
  onModalStateChange,
}) => {
  const isFetchingRef = useRef(false);

  // Sincronización real con Supabase DB respaldada en LocalStorage
  const [cloudAppointments, setCloudAppointments] = useState<Appointment[]>(() => {
    const cached = storageService.getCachedAppointments();
    return appointments && appointments.length > 0
      ? storageService.mergeAppointments(cached, appointments)
      : cached;
  });

  // Alerta sonora y visual en tiempo real de nuevas reservas
  interface NewBookingAlert {
    id: string;
    clientName: string;
    serviceName: string;
    time: string;
    date: string;
    timeoutId?: ReturnType<typeof setTimeout>;
  }
  const [newBookingAlert, setNewBookingAlert] = useState<NewBookingAlert | null>(null);

  useEffect(() => {
    return () => {
      if (newBookingAlert?.timeoutId) {
        clearTimeout(newBookingAlert.timeoutId);
      }
    };
  }, [newBookingAlert]);

  const activeBarberRef = useRef<Barber | null>(null);

  // Sincronización inmediata de bloqueos en memoria (0 ms)
  const [currentBlockedSlots, setCurrentBlockedSlots] = useState<BlockedSlot[]>(() => {
    const cached = storageService.getCachedBlockedSlots();
    return blockedSlots && blockedSlots.length > 0 ? blockedSlots : cached;
  });

  useEffect(() => {
    if (blockedSlots && blockedSlots.length > 0) {
      setCurrentBlockedSlots(blockedSlots);
    }
  }, [blockedSlots]);

  // Sincronizar cloudAppointments cuando lleguen citas actualizadas desde props (App.tsx)
  useEffect(() => {
    if (appointments && appointments.length > 0) {
      setCloudAppointments((prev) => {
        if (!prev || prev.length === 0) return appointments;
        const merged = storageService.mergeAppointments(prev, appointments);
        if (
          prev.length === merged.length &&
          prev.every(
            (p, idx) =>
              p.id === merged[idx]?.id &&
              p.status === merged[idx]?.status &&
              p.date === merged[idx]?.date &&
              p.time === merged[idx]?.time
          )
        ) {
          return prev;
        }
        return merged;
      });
    }
  }, [appointments]);

  // Manejador garantizado de nuevo turno local o presencial
  const handleAppointmentAdded = (newApt?: Appointment) => {
    if (newApt) {
      setCloudAppointments((prev) => {
        const merged = storageService.mergeAppointments(prev, [newApt]);
        storageService.saveAppointments(merged);
        return merged;
      });
    } else {
      const cached = storageService.getCachedAppointments();
      setCloudAppointments((prev) => storageService.mergeAppointments(cached, prev));
    }
    storageService.broadcastAppointmentEvent('NEW_BOOKING', newApt);
    onRefreshData();
  };

  // Requisito 2: Bandera isFetchingRef para que NUNCA se dispare una nueva consulta si ya hay una en curso
  const fetchAppointments = useCallback(async () => {
    if (isFetchingRef.current || storageService.getIsMutating()) {
      return;
    }
    try {
      isFetchingRef.current = true;
      // Consulta a la tabla public.appointments ordenada por appointment_time y created_at
      const { data: dbAppointments, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_time', { ascending: true })
        .order('created_at', { ascending: true });

      // Si la petición falla o hay error de red/502, CONSERVAR el estado actual en pantalla sin alternar ni sobrescribir
      if (error) {
        console.warn('Aviso al consultar citas de Supabase (conservando estado actual):', error.message);
        return;
      }

      if (dbAppointments && dbAppointments.length > 0) {
        const tableMapped: Appointment[] = dbAppointments.map(rowToAppointment);
        setCloudAppointments((prev) => {
          const cachedLocal = storageService.getCachedAppointments();
          const base = (prev && prev.length > 0)
            ? prev
            : (cachedLocal.length > 0 ? cachedLocal : []);
          const merged = storageService.mergeAppointments(base, tableMapped);
          if (
            base.length === merged.length &&
            base.every(
              (p, idx) =>
                p.id === merged[idx]?.id &&
                p.status === merged[idx]?.status &&
                p.date === merged[idx]?.date &&
                p.time === merged[idx]?.time
            )
          ) {
            return prev;
          }
          return merged;
        });
      }
    } catch (err) {
      // Si la petición falla por red o timeout, conservar el estado actual sin sobrescribir con arreglos incompletos
      console.warn('Error al consultar citas de Supabase en BarberDashboard (conservando estado actual):', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, []); // Dependencias ESTRICTAS [] para evitar recreaciones en cada render

  const onRefreshDataRef = useRef(onRefreshData);
  onRefreshDataRef.current = onRefreshData;

  // Requisito 1 & ORDEN 2: Consulta inicial + suscripción a Realtime para appointments, blocked_slots y barbers
  useEffect(() => {
    fetchAppointments();

    const channel = supabase
      .channel('appointments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload: any) => {
        // Inmediatamente reflejar cambio en memoria y matriz local
        if (payload?.new) {
          const mapped = rowToAppointment(payload.new);
          setCloudAppointments((prev) => storageService.mergeAppointments(prev, [mapped]));
        } else if (payload?.eventType === 'DELETE' && payload.old?.id) {
          const deletedId = String(payload.old.id);
          setCloudAppointments((prev) => prev.filter((a) => a.id !== deletedId));
        }

        fetchAppointments();
        onRefreshDataRef.current();

        // Requisito 6: Alerta sonora y visual en tiempo real para el barbero
        if (payload?.eventType === 'INSERT' && payload.new) {
          const row = payload.new;
          const currentB = activeBarberRef.current;
          if (currentB) {
            const aptBarberId = String(row.barber_id || row.barberId || '').trim();
            const cleanBId = aptBarberId.replace(/^b-/, '').toLowerCase();
            const activeBId = String(currentB.id || '').replace(/^b-/, '').toLowerCase();
            const activeUId = String(currentB.userId || '').replace(/^b-/, '').toLowerCase();
            const aptEmail = (row.barber_email || '').toLowerCase().trim();
            const bEmail = (currentB.email || '').toLowerCase().trim();

            const isForThisBarber =
              aptBarberId === currentB.id ||
              aptBarberId === currentB.userId ||
              cleanBId === activeBId ||
              (activeUId && cleanBId === activeUId) ||
              (bEmail && aptEmail && bEmail === aptEmail);

            if (isForThisBarber) {
              try {
                realtimeService.playChime();
              } catch {}

              setNewBookingAlert((prev) => {
                if (prev?.timeoutId) clearTimeout(prev.timeoutId);
                const tid = setTimeout(() => {
                  setNewBookingAlert(null);
                }, 8000);
                return {
                  id: `alert-${Date.now()}`,
                  clientName: row.client_name || row.clientName || 'Nuevo Cliente',
                  serviceName: row.service_name || row.serviceName || 'Cita de Barbería',
                  time: row.appointment_time || row.time || '',
                  date: row.appointment_date || row.date || '',
                  timeoutId: tid,
                };
              });
            }
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_slots' }, () => {
        onRefreshDataRef.current();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barbers' }, () => {
        onRefreshDataRef.current();
      })
      .subscribe();

    // Suscripción al bus local y multi-pestaña
    const unsubscribeRealtime = realtimeService.subscribe((event: any) => {
      if (!storageService.getIsMutating() && !isFetchingRef.current) {
        fetchAppointments();
        onRefreshDataRef.current();
      }

      if (event?.type === 'NEW_BOOKING' && event?.payload) {
        const row = event.payload;
        const currentB = activeBarberRef.current;
        if (currentB) {
          const aptBarberId = String(row.barber_id || row.barberId || '').trim();
          const cleanBId = aptBarberId.replace(/^b-/, '').toLowerCase();
          const activeBId = String(currentB.id || '').replace(/^b-/, '').toLowerCase();
          const activeUId = String(currentB.userId || '').replace(/^b-/, '').toLowerCase();

          const isForThisBarber =
            aptBarberId === currentB.id ||
            aptBarberId === currentB.userId ||
            cleanBId === activeBId ||
            (activeUId && cleanBId === activeUId);

          if (isForThisBarber) {
            setNewBookingAlert((prev) => {
              if (prev?.timeoutId) clearTimeout(prev.timeoutId);
              const tid = setTimeout(() => {
                setNewBookingAlert(null);
              }, 8000);
              return {
                id: `alert-${Date.now()}`,
                clientName: row.client_name || row.clientName || 'Nuevo Cliente',
                serviceName: row.service_name || row.serviceName || 'Cita de Barbería',
                time: row.appointment_time || row.time || '',
                date: row.appointment_date || row.date || '',
                timeoutId: tid,
              };
            });
          }
        }
      }
    });

    return () => {
      try {
        channel.unsubscribe();
        supabase.removeChannel(channel);
      } catch {}
      unsubscribeRealtime();
    };
  }, [fetchAppointments]);

  // Requisito 3: Estabilizar citas efectivas. Si una petición falla o carga, conserva el estado actual sin alternar ni sobrescribir con arreglos incompletos
  const effectiveAppointments = useMemo(() => {
    const cached = storageService.getCachedAppointments();
    let current = (cloudAppointments && cloudAppointments.length > 0)
      ? cloudAppointments
      : (appointments && appointments.length > 0 ? appointments : cached);
    if (appointments && appointments.length > 0 && current !== appointments) {
      // El estado local inmediato (current) prevalece sobre los props de citas antiguos
      current = storageService.mergeAppointments(appointments, current);
    }
    return current;
  }, [cloudAppointments, appointments]);

  // Active barber selection: aislado estrictamente por currentUser.id cuando es barbero
  const [activeBarberId, setActiveBarberId] = useState<string>(() => {
    if (currentUser?.role === 'barber' && currentUser.id) {
      return currentUser.barberId || currentUser.id;
    }
    return barbers[0]?.id || '';
  });

  // Estado aislado del perfil del barbero autenticado cargado estrictamente con .eq("user_id", authUser.id).maybeSingle()
  const [authenticatedBarberRow, setAuthenticatedBarberRow] = useState<Barber | null>(null);

  const loadAuthenticatedBarberFromDb = useCallback(async () => {
    if (!currentUser?.id || currentUser.role !== 'barber') {
      setAuthenticatedBarberRow(null);
      return;
    }
    try {
      // Requisito 2: Consulta estrictamente filtrada por user_id usando maybeSingle() para evitar error HTTP 406
      const { data: row, error } = await supabase
        .from('barbers')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (error || !row) {
        const localSaved = storageService.getBarberProfile(currentUser.id, currentUser.email);
        if (
          localSaved &&
          (localSaved.userId === currentUser.id || (localSaved as any).user_id === currentUser.id || localSaved.id === currentUser.id) &&
          (localSaved.business_name || localSaved.barbershopName)
        ) {
          setAuthenticatedBarberRow(localSaved as Barber);
          return;
        }
        setAuthenticatedBarberRow(null);
        return;
      }

      const mapped = await storageService.getAuthenticatedBarberProfile({
        id: currentUser.id,
        email: currentUser.email,
      });
      setAuthenticatedBarberRow(mapped);
    } catch {
      setAuthenticatedBarberRow(null);
    }
  }, [currentUser?.id, currentUser?.email, currentUser?.role]);

  useEffect(() => {
    loadAuthenticatedBarberFromDb();
  }, [loadAuthenticatedBarberFromDb, barbers]);

  React.useEffect(() => {
    if (currentUser?.role === 'barber' && currentUser.id) {
      const targetId = authenticatedBarberRow?.id || currentUser.barberId || currentUser.id;
      setActiveBarberId((prev) => (prev !== targetId ? targetId : prev));
      return;
    }
    setActiveBarberId((prev) => {
      if ((!prev || !barbers.some((b) => b.id === prev)) && barbers.length > 0) {
        return barbers[0].id;
      }
      return prev;
    });
  }, [barbers, currentUser?.role, currentUser?.barberId, currentUser?.id, authenticatedBarberRow?.id]);

  // Active date selection
  const daysList = useMemo(() => getNextDays(7), []);
  const [selectedDate, setSelectedDate] = useState<string>(daysList[0]?.date || '');

  // Modals state
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isWalkinModalOpen, setIsWalkinModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [targetSlotTime, setTargetSlotTime] = useState<string | undefined>(undefined);
  // Requisito 3: Estado para bloqueo rápido de turno individual
  const [quickBlockSlot, setQuickBlockSlot] = useState<{ date: string; time: string } | null>(null);
  const [quickBlockReason, setQuickBlockReason] = useState<string>('Descanso / Almuerzo');
  const [quickBlockCustomReason, setQuickBlockCustomReason] = useState<string>('');
  const [isSavingQuickBlock, setIsSavingQuickBlock] = useState<boolean>(false);

  // View mode: 'matrix' (default) | 'grid' | 'timeline'
  const [viewMode, setViewMode] = useState<'matrix' | 'grid' | 'timeline'>('matrix');

  const activeBarber = useMemo(() => {
    let resolved: any = null;
    if (currentUser?.role === 'barber') {
      const authUserId = currentUser.id;

      // 1. Verificar únicamente perfiles que pertenezcan estrictamente a authUserId (user_id === currentUser.id)
      const strictMatchInProps = barbers.find(
        (b) =>
          (b.userId && b.userId === authUserId) ||
          ((b as any).user_id && (b as any).user_id === authUserId) ||
          b.id === authUserId
      );

      const strictUserBarberProfile =
        (currentUser as any)?.barberProfile &&
        (((currentUser as any).barberProfile.userId === authUserId) ||
          ((currentUser as any).barberProfile.user_id === authUserId) ||
          ((currentUser as any).barberProfile.id === authUserId))
          ? (currentUser as any).barberProfile
          : null;

      const localSavedForUser = storageService.getBarberProfile(authUserId, currentUser.email);
      const validLocalSaved =
        localSavedForUser &&
        (localSavedForUser.userId === authUserId ||
          (localSavedForUser as any).user_id === authUserId ||
          localSavedForUser.id === authUserId)
          ? localSavedForUser
          : null;

      // Priorizar el perfil que ya tenga los datos principales configurados para este authUserId
      const candidates = [
        strictUserBarberProfile,
        validLocalSaved,
        strictMatchInProps,
        authenticatedBarberRow,
      ].filter(Boolean);

      const configuredCandidate = candidates.find(
        (c: any) =>
          String(c.business_name || c.barbershopName || c.shop_name || '').trim().length > 0 &&
          String(c.address || '').trim().length > 0 &&
          String(c.phone || '').trim().length > 0
      );

      const sourceProfile =
        configuredCandidate ||
        candidates.find(
          (c: any) =>
            String(c.business_name || c.barbershopName || c.shop_name || '').trim().length > 0
        ) ||
        candidates[0] ||
        null;

      const rawBusinessName = String(
        sourceProfile?.business_name ||
        sourceProfile?.businessName ||
        sourceProfile?.barbershopName ||
        sourceProfile?.shop_name ||
        ''
      ).trim();

      const rawAlias = String(
        sourceProfile?.alias ||
        sourceProfile?.nickname ||
        ''
      ).trim();

      const rawName = String(sourceProfile?.name || '').trim();
      const rawAddress = String(sourceProfile?.address || '').trim();
      const rawPhone = String(sourceProfile?.phone || '').trim();
      const rawServices: Service[] = Array.isArray(sourceProfile?.services)
        ? sourceProfile.services
        : [];

      const isConfigured = Boolean(
        rawBusinessName &&
        rawName &&
        rawAddress &&
        rawPhone
      );

      if (sourceProfile && (isConfigured || rawBusinessName || rawAlias || rawAddress || rawPhone || rawServices.length > 0)) {
        resolved = {
          ...sourceProfile,
          id: sourceProfile.id || authUserId,
          userId: authUserId,
          email: currentUser.email || sourceProfile.email || '',
          name: rawName,
          alias: rawAlias,
          nickname: rawAlias,
          business_name: rawBusinessName,
          businessName: rawBusinessName,
          barbershopName: rawBusinessName,
          shop_name: rawBusinessName,
          address: rawAddress,
          phone: rawPhone,
          services: rawServices,
          serviceIds: rawServices.map((s: any) => s.id),
          is_profile_completed: isConfigured,
          isProfileCompleted: isConfigured,
        };
      } else {
        // Requisito 2b: PROHIBIDO hacer fallback a perfiles de prueba, mocks o datos en caché.
        // Inicializar 100% VACÍO ('business_name: ""', 'alias: ""', 'phone: ""', 'services: []')
        resolved = storageService.createEmptyBarberProfile(authUserId, currentUser.email);
      }
    } else {
      resolved = barbers.find((b) => b.id === activeBarberId) || barbers[0];
    }

    if (!resolved) {
      resolved = storageService.createEmptyBarberProfile(
        currentUser?.id || 'b-empty',
        currentUser?.email
      );
    }

    // Aislar disponibilidad y servicios estrictamente por el userId del barbero autenticado
    const targetId = currentUser?.role === 'barber' ? currentUser.id : resolved?.id;
    const savedAvail = targetId
      ? storageService.getBarberAvailabilitySettings(targetId, currentUser?.id, currentUser?.email)
      : null;

    const profile = resolved;
    const effWorkingHours = savedAvail?.workingHours || profile?.workingHours || {
      start: '09:00',
      end: '20:00',
      slotDurationMinutes: 30,
      lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
      workingDays: [1, 2, 3, 4, 5, 6],
    };

    const diasAtencion = profile?.schedule?.workingDays || profile?.workingDays || profile?.workingDaysText || 'Lunes a Sábado';
    const horaApertura = effWorkingHours?.start || profile?.workingHours?.start || profile?.openTime || profile?.schedule?.openTime || '09:00';
    const horaCierre = effWorkingHours?.end || profile?.workingHours?.end || profile?.closeTime || profile?.schedule?.closeTime || '20:00';

    const defaultWorkingDays = [1, 2, 3, 4, 5, 6];
    const workingDaysArray = Array.isArray(effWorkingHours?.workingDays)
      ? effWorkingHours.workingDays
      : Array.isArray(profile?.workingHours?.workingDays)
      ? profile.workingHours.workingDays
      : defaultWorkingDays;

    const barberServices: Service[] = Array.isArray(resolved.services)
      ? resolved.services
      : [];

    const resolvedExceptions =
      (Array.isArray(effWorkingHours?.specialDaySchedules) && effWorkingHours.specialDaySchedules.length > 0)
        ? effWorkingHours.specialDaySchedules
        : (Array.isArray(profile?.workingHours?.specialDaySchedules) && profile.workingHours.specialDaySchedules.length > 0)
        ? profile.workingHours.specialDaySchedules
        : (Array.isArray(savedAvail?.workingHours?.specialDaySchedules) && savedAvail.workingHours.specialDaySchedules.length > 0)
        ? savedAvail.workingHours.specialDaySchedules
        : (Array.isArray((profile?.schedule as any)?.exceptions) && (profile?.schedule as any).exceptions.length > 0)
        ? (profile?.schedule as any).exceptions
        : (Array.isArray((profile?.schedule as any)?.special_hours) && (profile?.schedule as any).special_hours.length > 0)
        ? (profile?.schedule as any).special_hours
        : [];

    const resolvedRestDay =
      savedAvail?.restDay ||
      (profile?.schedule as any)?.rest_day ||
      (profile as any)?.restDay ||
      (resolved?.schedule as any)?.rest_day;

    const resolvedLunchBreak =
      effWorkingHours?.lunchBreak ||
      profile?.workingHours?.lunchBreak ||
      (profile?.schedule as any)?.lunch_break ||
      { enabled: true, start: '14:00', end: '15:00' };

    return {
      ...resolved,
      services: barberServices,
      serviceIds: barberServices.map((s: any) => s.id),
      workingDaysText: diasAtencion,
      workingDays: diasAtencion,
      openTime: horaApertura,
      closeTime: horaCierre,
      schedule: {
        workingDays: diasAtencion,
        openTime: formatTimeTo12h(horaApertura),
        closeTime: formatTimeTo12h(horaCierre),
        exceptions: resolvedExceptions,
        special_hours: resolvedExceptions,
        rest_day: resolvedRestDay,
        lunch_break: resolvedLunchBreak,
      },
      workingHours: {
        start: normalizeTimeTo24h(horaApertura, '09:00'),
        end: normalizeTimeTo24h(horaCierre, '20:00'),
        slotDurationMinutes: effWorkingHours?.slotDurationMinutes || profile?.workingHours?.slotDurationMinutes || 30,
        lunchBreak: resolvedLunchBreak,
        workingDays: workingDaysArray,
        specialDaySchedules: resolvedExceptions,
      },
    } as Barber;
  }, [barbers, activeBarberId, currentUser, authenticatedBarberRow]);

  activeBarberRef.current = activeBarber;

  // Requisito 3: Evaluar si el perfil del barbero está incompleto:
  // !barberProfile || !barberProfile.business_name || !barberProfile.address || !barberProfile.phone (y nombre del barbero)
  const barberProfile = activeBarber;
  const isProfileIncomplete = useMemo(() => {
    return Boolean(
      !barberProfile ||
      !String(barberProfile.business_name || barberProfile.barbershopName || '').trim() ||
      !String(barberProfile.name || '').trim() ||
      !String(barberProfile.address || '').trim() ||
      !String(barberProfile.phone || '').trim()
    );
  }, [barberProfile]);

  const isProfileComplete = !isProfileIncomplete;
  const isProfileCompleted = isProfileComplete;

  // Today's date string
  const todayStr = daysList[0]?.date;
  const isSelectedToday = selectedDate === todayStr;

  // Yesterday's date string para permitir consultar y gestionar turnos del día anterior
  const yesterdayDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Day appointments for active barber (con cruce estricto de fecha, barbero y hora)
  const dayAppointments = useMemo(() => {
    if (!activeBarber) return [];
    const cleanActiveBarberId = (activeBarber.id || '').replace(/^b-/, '').trim().toLowerCase();
    const cleanActiveBarberName = (activeBarber.name || '').trim().toLowerCase();

    return effectiveAppointments
      .filter((a) => {
        if (!a) return false;
        const aptDate = (a.date || (a as any).appointment_date || '').trim();
        const isSameDate = aptDate === selectedDate.trim();
        const aptBarberId = a.barberId || (a as any).barber_id || '';
        const cleanAptBarberId = aptBarberId.replace(/^b-/, '').trim().toLowerCase();
        const aptEmail = (a.barberEmail || (a as any).barber_email || '').toLowerCase().trim();
        const activeBarberEmail = (activeBarber.email || currentUser?.email || '').toLowerCase().trim();
        const cleanAptBarberName = (a.barberName || (a as any).barber_name || '').trim().toLowerCase();

        const isSameBarber =
          aptBarberId === activeBarber.id ||
          (Boolean(activeBarber.userId) && (aptBarberId === activeBarber.userId || cleanAptBarberId === (activeBarber.userId || '').replace(/^b-/, '').trim().toLowerCase())) ||
          (Boolean(activeBarberEmail) && Boolean(aptEmail) && aptEmail === activeBarberEmail) ||
          cleanAptBarberId === cleanActiveBarberId ||
          (cleanAptBarberName && cleanActiveBarberName && cleanAptBarberName === cleanActiveBarberName);

        return isSameDate && isSameBarber;
      })
      .sort((a, b) => {
        const timeA = normalizeTimeTo24h(a.time || '');
        const timeB = normalizeTimeTo24h(b.time || '');
        if (timeA !== timeB) return timeA.localeCompare(timeB);
        const createdA = a.createdAt || (a as any).created_at || '';
        const createdB = b.createdAt || (b as any).created_at || '';
        if (createdA !== createdB) return createdA.localeCompare(createdB);
        return a.id.localeCompare(b.id);
      });
  }, [effectiveAppointments, activeBarber, selectedDate, currentUser]);

  // Total de citas históricas o programadas de este barbero específico
  const totalBarberAppointments = useMemo(() => {
    if (!activeBarber) return 0;
    const cleanActiveBarberId = (activeBarber.id || '').replace(/^b-/, '').toLowerCase();
    const activeBarberEmail = (activeBarber.email || currentUser?.email || '').toLowerCase().trim();

    return effectiveAppointments.filter((a) => {
      const aptBarberId = a.barberId || (a as any).barber_id || '';
      const aptEmail = (a.barberEmail || (a as any).barber_email || '').toLowerCase().trim();
      const cleanAptBarberId = aptBarberId.replace(/^b-/, '').toLowerCase();

      return (
        aptBarberId === activeBarber.id ||
        (Boolean(activeBarber.userId) && (aptBarberId === activeBarber.userId || cleanAptBarberId === (activeBarber.userId || '').replace(/^b-/, '').trim().toLowerCase())) ||
        (Boolean(activeBarberEmail) && Boolean(aptEmail) && aptEmail === activeBarberEmail) ||
        cleanAptBarberId === cleanActiveBarberId ||
        (a.barberName && activeBarber.name && a.barberName.trim().toLowerCase() === activeBarber.name.trim().toLowerCase())
      );
    }).length;
  }, [effectiveAppointments, activeBarber, currentUser]);

  // Requisito 6: Dividir entre turnos activos del día e historial/cierres
  const activeDayAppointments = useMemo(() => {
    return dayAppointments.filter((a) => {
      const s = (a.status || '').toLowerCase();
      return s !== 'completed' && s !== 'cancelled' && (s === 'confirmed' || s === 'in_progress');
    });
  }, [dayAppointments]);

  const historyDayAppointments = useMemo(() => {
    return dayAppointments.filter((a) => {
      const s = (a.status || '').toLowerCase();
      return s === 'completed' || s === 'cancelled';
    });
  }, [dayAppointments]);

  // Alternador de Orden de Visualización de Citas en el Historial (Ascendente vs. Descendente por hora)
  const [historySortOrder, setHistorySortOrder] = useState<'asc' | 'desc'>('asc');

  const sortedHistoryAppointments = useMemo(() => {
    return [...historyDayAppointments].sort((a, b) => {
      const timeA = normalizeTimeTo24h(a.time || '');
      const timeB = normalizeTimeTo24h(b.time || '');
      return historySortOrder === 'asc' ? timeA.localeCompare(timeB) : timeB.localeCompare(timeA);
    });
  }, [historyDayAppointments, historySortOrder]);

  // Pestañas de visualización en la lista cronológica: 'active' | 'history'
  const [timelineTab, setTimelineTab] = useState<'active' | 'history'>('active');

  // Control para expandir/colapsar citas si hay más de 3 activas
  const [showAllActiveAppointments, setShowAllActiveAppointments] = useState<boolean>(false);

  // Control para expandir/colapsar citas en Historial & Cierres (máx 3 por defecto)
  const [showAllHistory, setShowAllHistory] = useState<boolean>(false);

  // ID de cita resaltada al navegar desde la matriz de horarios
  const [highlightedAptId, setHighlightedAptId] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Resetear vista colapsada a las 3 primeras al cambiar de fecha
  useEffect(() => {
    setShowAllActiveAppointments(false);
    setShowAllHistory(false);
  }, [selectedDate]);

  // Limpiar timer de resaltado al desmontar
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  // Requisito 5: Navegación desde la Matriz de Horarios a la Lista Cronológica con resaltado de 5s exactos
  const handleNavigateToAppointment = (appointmentId: string) => {
    setViewMode('timeline');
    setHighlightedAptId(appointmentId);

    const apt = dayAppointments.find((a) => a.id === appointmentId);
    if (apt && (apt.status === 'completed' || apt.status === 'cancelled')) {
      setTimelineTab('history');
      setShowAllHistory(true);
    } else {
      setTimelineTab('active');
      setShowAllActiveAppointments(true);
    }

    setTimeout(() => {
      const el = document.getElementById(`appointment-card-${appointmentId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    // Duración de 5 segundos exactos (5000 ms) sin interrupciones
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedAptId(null);
    }, 5000);
  };

  // Full day slots calculation
  const daySlots: TimeSlotStatus[] = useMemo(() => {
    if (!activeBarber) return [];
    return generateDailySlots(activeBarber, selectedDate, effectiveAppointments, currentBlockedSlots);
  }, [activeBarber, selectedDate, effectiveAppointments, currentBlockedSlots]);

  const resolveSlotBlockedReason = useCallback(
    (slot: any) => {
      const scheduleReasons = (activeBarber?.schedule as any)?.blocked_reasons || {};
      const backupReason =
        scheduleReasons[`${selectedDate}_${slot.time}`] ||
        scheduleReasons[`${selectedDate}_${formatTimeTo12h(slot.time)}`];
      if (slot.blockedSlot?.reason && slot.blockedSlot.reason !== 'Bloqueado' && slot.blockedSlot.reason !== 'Horario Bloqueado') {
        return slot.blockedSlot.reason;
      }
      if (slot.reason && slot.reason !== 'Bloqueado' && slot.reason !== 'Horario Bloqueado') {
        return slot.reason;
      }
      return backupReason || slot.blockedSlot?.reason || slot.reason || 'Horario Bloqueado';
    },
    [activeBarber, selectedDate]
  );

  // KPIs
  const confirmedCount = dayAppointments.filter((a) => a.status === 'confirmed').length;
  const completedCount = dayAppointments.filter((a) => a.status === 'completed').length;
  const inProgressCount = dayAppointments.filter((a) => a.status === 'in_progress').length;
  const totalTodayAppointments = confirmedCount + completedCount + inProgressCount;
  const pendingAppointmentsCount = confirmedCount + inProgressCount;
  const todayNumberColor =
    pendingAppointmentsCount > 0
      ? 'text-amber-400'
      : totalTodayAppointments > 0
      ? 'text-emerald-400'
      : 'text-white';
  const estimatedRevenue = dayAppointments
    .filter((a) => a.status !== 'cancelled')
    .reduce((sum, a) => sum + Number((a as any).price ?? (a as any).service_price ?? a.servicePrice ?? 0), 0);

  // Find next upcoming appointment today
  const nextAppointment = useMemo(() => {
    const pending = dayAppointments.filter((a) => a.status === 'confirmed' || a.status === 'in_progress');
    if (pending.length === 0) return null;
    if (!isSelectedToday) return pending[0];
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const upcoming = pending.find((a) => {
      const time24 = normalizeTimeTo24h(a.time || '');
      const [h, m] = time24.split(':').map(Number);
      return h * 60 + (m || 0) >= nowMins;
    });
    return upcoming || pending[0];
  }, [dayAppointments, isSelectedToday]);

  // Cancellation & Undo State
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [undoToast, setUndoToast] = useState<{
    appointment: Appointment;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);



  // Clean up timer on unmount
  React.useEffect(() => {
    return () => {
      if (undoToast?.timeoutId) {
        clearTimeout(undoToast.timeoutId);
      }
    };
  }, [undoToast]);

  // ORDEN 3: Notificar si cualquier modal del Dashboard está abierto
  const isAnyDashboardModalActive = Boolean(
    isSettingsModalOpen ||
    isWalkinModalOpen ||
    isBlockModalOpen ||
    appointmentToCancel ||
    quickBlockSlot
  );

  useEffect(() => {
    onModalStateChange?.(isAnyDashboardModalActive);
  }, [isAnyDashboardModalActive, onModalStateChange]);

  // Requisito 2: Listener global de teclado (keydown) para cerrar modal activo con tecla Escape (Esc)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (quickBlockSlot) {
          setQuickBlockSlot(null);
        } else if (appointmentToCancel) {
          setAppointmentToCancel(null);
        } else if (isWalkinModalOpen) {
          setIsWalkinModalOpen(false);
        } else if (isBlockModalOpen) {
          setIsBlockModalOpen(false);
        } else if (isSettingsModalOpen) {
          setIsSettingsModalOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appointmentToCancel, isWalkinModalOpen, isBlockModalOpen, isSettingsModalOpen, quickBlockSlot]);

  // Handlers for appointment status changes
  const handleUpdateStatus = (appointment: Appointment, newStatus: Appointment['status']) => {
    if (newStatus === 'cancelled') {
      setAppointmentToCancel(appointment);
      return;
    }

    const appointmentId = appointment.id;
    const targetStatus = newStatus;

    // 1. Mutación en memoria de forma sincrónica e instantánea (0 ms) en la línea 1
    setCloudAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: targetStatus } : apt
      )
    );

    // 2. Actualizar almacenamiento en caché local sincronizado de inmediato
    try {
      const cached = storageService.getCachedAppointments();
      const updatedLocal = cached.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: targetStatus } : apt
      );
      storageService.saveAppointments(updatedLocal);
    } catch {}

    // 3. Ejecutar llamada asíncrona a Supabase en segundo plano sin bloquear el renderizado local
    const normalizedDbStatus = targetStatus.toLowerCase();
    supabase
      .from('appointments')
      .update({ status: normalizedDbStatus })
      .eq('id', appointmentId)
      .then(({ error }) => {
        if (error) {
          console.error('Error sincronizando estado:', error);
          // Reintentar con mayúsculas si el esquema de base de datos usa enum en mayúsculas
          supabase.from('appointments').update({ status: targetStatus.toUpperCase() }).eq('id', appointmentId);
        }
      });

    // 4. Actualizar storageService y bus realtime en segundo plano
    storageService.updateAppointmentStatus(appointmentId, targetStatus).catch(() => {});
    const statusLabel =
      targetStatus === 'in_progress'
        ? 'en atención'
        : targetStatus === 'completed'
        ? 'completado'
        : 'actualizado';

    realtimeService.emit({
      type: 'STATUS_CHANGE',
      actor: 'barber',
      payload: { appointmentId, status: targetStatus },
      message: `Turno marcado como ${statusLabel}`,
    });
    onRefreshData();
  };

  const handleConfirmCancel = async () => {
    if (!appointmentToCancel) return;
    const apt = appointmentToCancel;
    setAppointmentToCancel(null);

    // Actualización INMEDIATA del estado local en memoria
    setCloudAppointments((prev) =>
      prev.map((a) => (a.id === apt.id ? { ...a, status: 'cancelled' as const, cancelledBy: 'barber' as const } : a))
    );

    // Actualizar almacenamiento en caché local sincronizado
    const cached = storageService.getCachedAppointments();
    const updatedLocal: Appointment[] = cached.map((a) => (a.id === apt.id ? { ...a, status: 'cancelled' as const, cancelledBy: 'barber' as const } : a));
    storageService.saveAppointments(updatedLocal);

    // Enviar actualización a Supabase directamente
    try {
      await supabase.from('appointments').update({ status: 'cancelled', cancelled_by: 'barber' }).eq('id', apt.id);
    } catch (dbErr) {
      console.warn('Error al cancelar en Supabase:', dbErr);
    }

    await storageService.updateAppointmentStatus(apt.id, 'cancelled', { cancelledBy: 'barber' });
    realtimeService.emit({
      type: 'CANCEL_BOOKING',
      actor: 'barber',
      payload: { appointmentId: apt.id, status: 'cancelled' },
      message: `Turno de ${apt.clientName} cancelado`,
    });
    onRefreshData();

    if (undoToast?.timeoutId) {
      clearTimeout(undoToast.timeoutId);
    }

    const timer = setTimeout(() => {
      setUndoToast(null);
    }, 8000);

    setUndoToast({
      appointment: apt,
      timeoutId: timer,
    });
  };

  const handleUndoCancel = async () => {
    if (!undoToast) return;
    const apt = undoToast.appointment;
    if (undoToast.timeoutId) {
      clearTimeout(undoToast.timeoutId);
    }
    setUndoToast(null);

    // Actualización INMEDIATA del estado local en memoria
    setCloudAppointments((prev) =>
      prev.map((a) => (a.id === apt.id ? { ...a, status: 'confirmed' as const, cancelledBy: undefined } : a))
    );

    const cached = storageService.getCachedAppointments();
    const updatedLocal: Appointment[] = cached.map((a) => (a.id === apt.id ? { ...a, status: 'confirmed' as const, cancelledBy: undefined } : a));
    storageService.saveAppointments(updatedLocal);

    try {
      await supabase.from('appointments').update({ status: 'confirmed', cancelled_by: null }).eq('id', apt.id);
    } catch (dbErr) {
      console.warn('Error al revertir cancelación en Supabase:', dbErr);
    }

    await storageService.updateAppointmentStatus(apt.id, 'confirmed');
    realtimeService.emit({
      type: 'STATUS_CHANGE',
      actor: 'barber',
      payload: { appointmentId: apt.id, status: 'confirmed' },
      message: `Cancelación deshecha. Turno de ${apt.clientName} restaurado.`,
    });
    onRefreshData();
  };

  const handleReportNoShow = async (appointment: Appointment) => {
    const clientName = appointment.clientName || 'el cliente';
    if (!window.confirm(`¿Confirmas que ${clientName} no se presentó a su turno de las ${formatTimeTo12h(appointment.time)}? Se cerrará la cita y se registrará un reporte por inasistencia en su perfil.`)) {
      return;
    }

    const appointmentId = appointment.id;
    const targetEmail = (appointment.clientEmail || (appointment as any).client_email || '').trim().toLowerCase();

    // 1. Mutación local inmediata
    setCloudAppointments((prev) =>
      prev.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: 'cancelled' as const, cancelledBy: 'barber' as const, clientNotes: 'Inasistencia del cliente (No llegó)' } : apt
      )
    );

    try {
      const cached = storageService.getCachedAppointments();
      const updatedLocal = cached.map((apt) =>
        apt.id === appointmentId ? { ...apt, status: 'cancelled' as const, cancelledBy: 'barber' as const, clientNotes: 'Inasistencia del cliente (No llegó)' } : apt
      );
      storageService.saveAppointments(updatedLocal);
    } catch {}

    // 2. Actualizar en Supabase
    try {
      await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          cancelled_by: 'barber',
          notes: 'Reporte de inasistencia (No se presentó al turno)',
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentId);
    } catch (e) {
      console.warn('Error cerrando cita por inasistencia en Supabase:', e);
    }

    // 3. Registrar reporte/bloqueo automático al correo del cliente
    if (targetEmail && activeBarber?.id) {
      try {
        await storageService.blockClient(activeBarber.id, targetEmail);
      } catch (err) {
        console.warn('Error registrando reporte de inasistencia:', err);
      }
    }

    realtimeService.emit({
      type: 'CANCEL_BOOKING',
      actor: 'barber',
      payload: { appointmentId, reason: 'no_show', clientEmail: targetEmail },
      message: `Inasistencia registrada para la cita de ${clientName}.`,
    });

    setActionToast(`Inasistencia reportada para ${clientName}. Se cerró el turno y se registró el reporte para ${targetEmail || 'el cliente'}.`);
    setTimeout(() => setActionToast(null), 5000);
    fetchAppointments();
    onRefreshData();
  };

  const handleUnblockSlot = async (slot: TimeSlotStatus) => {
    if (!activeBarber) return;

    // Actualización inmediata local en memoria (0 ms)
    setCurrentBlockedSlots((prev) =>
      prev.filter(
        (s) =>
          (!slot.blockedSlot || s.id !== slot.blockedSlot.id) &&
          normalizeTime(s.time) !== normalizeTime(slot.time)
      )
    );

    if (slot.blockedSlot) {
      await storageService.removeBlockedSlot(slot.blockedSlot.id);
    } else {
      // Unblock lunch break or general schedule rule for this specific date
      storageService.addUnblockedException(activeBarber.id, selectedDate, slot.time);
    }

    realtimeService.emit({
      type: 'UNBLOCK_SLOT',
      actor: 'barber',
      payload: { barberId: activeBarber.id, date: selectedDate, time: slot.time },
      message: 'Horario desbloqueado',
    });
    onRefreshData();
  };

  // Requisito 3: Bloqueo rápido de franja individual
  const handleConfirmQuickBlock = async () => {
    if (!quickBlockSlot || !activeBarber) return;
    setIsSavingQuickBlock(true);
    try {
      const finalReason = quickBlockReason === 'Otro motivo...'
        ? (quickBlockCustomReason.trim() || 'Bloqueo personalizado')
        : quickBlockReason;

      const newSlot: BlockedSlot = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, '0')}`),
        barberId: activeBarber.id,
        date: quickBlockSlot.date,
        time: quickBlockSlot.time,
        reason: finalReason,
        createdAt: new Date().toISOString(),
      };

      storageService.removeUnblockedException(activeBarber.id, quickBlockSlot.date, quickBlockSlot.time);

      await storageService.addBlockedSlots([newSlot]);

      setCurrentBlockedSlots((prev) => {
        const ids = new Set([newSlot.id]);
        const filtered = prev.filter((s) => !ids.has(s.id) && !(s.date === newSlot.date && s.time === newSlot.time));
        return [...filtered, newSlot];
      });

      realtimeService.emit({
        type: 'BLOCK_SLOT',
        actor: 'barber',
        payload: [newSlot],
        message: `Horario ${quickBlockSlot.time} bloqueado`,
      });

      onRefreshData();
      setQuickBlockSlot(null);
      setQuickBlockCustomReason('');
    } catch (err) {
      console.warn('Error en bloqueo rápido:', err);
    } finally {
      setIsSavingQuickBlock(false);
    }
  };

  // Requisito 3: Envío / Reenvío de notificación por WhatsApp al cliente
  const handleSendWhatsAppNotification = (apt: Appointment) => {
    const cleanPhone = formatPhoneForWhatsApp(apt.clientPhone);
    if (!cleanPhone || apt.clientPhone === 'Presencial') {
      realtimeService.emit({
        type: 'STATUS_CHANGE',
        actor: 'barber',
        payload: null,
        message: 'Este cliente no tiene un número de teléfono registrado.',
      });
      return;
    }
    const shop = (activeBarber?.barbershopName || (activeBarber as any)?.business_name || (activeBarber as any)?.shop_name || 'LA BARBERÍA').toUpperCase();
    const dateFormatted = formatDateLabel(apt.date);
    const time12 = formatTimeTo12h(apt.time);
    const text = `¡Hola ${apt.clientName}! Te confirmamos tu turno en ${shop} para el servicio de ${apt.serviceName} el día ${dateFormatted} a las ${time12}. ¡Te esperamos en la Barbería!`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Requisito 5: Helper para renderizar cada tarjeta de cita reestructurada en 2 renglones
  const renderAppointmentCard = (apt: Appointment) => {
    const isConfirmed = apt.status === 'confirmed';
    const isInProgress = apt.status === 'in_progress';
    const isCompleted = apt.status === 'completed';
    const isCancelled = apt.status === 'cancelled';
    const isHighlighted = highlightedAptId === apt.id;

    // Fondo y borde adaptados para alto contraste según estado (Requisito 1)
    const bgClass = isInProgress
      ? 'bg-blue-950/20'
      : isCompleted
      ? 'bg-emerald-950/20'
      : isCancelled
      ? 'bg-slate-900/30 opacity-60'
      : 'bg-slate-900/90 shadow-md';

    const borderClass = isHighlighted
      ? 'border-2 border-amber-500 hover:border-amber-500 shadow-lg shadow-amber-500/20'
      : isInProgress
      ? 'border-blue-500/60 shadow-md ring-1 ring-blue-400/30'
      : isCancelled
      ? 'border-rose-500/60'
      : isCompleted
      ? 'border-emerald-700 hover:border-emerald-600'
      : 'border-emerald-400/70 hover:border-emerald-400';

    return (
      <div
        key={apt.id}
        id={`appointment-card-${apt.id}`}
        className={`p-3.5 sm:p-4 rounded-xl border transition-all duration-300 ${bgClass} ${borderClass} space-y-3`}
      >
        {/* Renglón 1 (Superior): Hora de la cita, badge de estado, badge de tipo ("Presencial" o "Web") y código */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80 w-full flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm sm:text-base font-black px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-amber-400 tracking-tight shadow-xs">
              {formatTimeTo12h(apt.time)}
            </span>

            {/* Badge de Estado: Confirmado (Verde esmeralda), En Atención (Ámbar), Completado (Verde), Cancelado (Rojo) */}
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                isInProgress
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : isCompleted
                  ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800'
                  : isCancelled
                  ? 'bg-rose-950/40 border border-rose-500/50 text-rose-400'
                  : 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              {isInProgress
                ? 'En Atención'
                : isCompleted
                ? 'Completado'
                : isCancelled
                ? 'Cancelado'
                : 'Confirmado'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Badge de Tipo: Presencial o Web */}
            {apt.source === 'walk_in' ? (
              <span className="text-[10px] sm:text-[11px] font-bold text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/60">
                Presencial
              </span>
            ) : (
              <span className="text-[10px] sm:text-[11px] font-bold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/60">
                Web
              </span>
            )}

            {/* Código de cita */}
            <span className="text-xs font-mono font-semibold text-slate-400">
              {formatBookingCode(apt.code, 'CO')}
            </span>
          </div>
        </div>

        {/* Renglón 2 (Inferior): Nombre del cliente, servicio solicitado, duración, precio y botones de acción rápida */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
          {/* Detalles del Cliente y Servicio */}
          <div className="min-w-0 flex-1">
            {onOpenClientProfile ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenClientProfile({
                    name: apt.clientName,
                    email: apt.clientEmail || (apt as any).client_email,
                    phone: apt.clientPhone || (apt as any).client_phone,
                    id: apt.clientId || (apt as any).client_id,
                    appointment: apt,
                    appointmentDate: apt.date || (apt as any).appointment_date,
                    appointmentTime: normalizeTimeTo24h(apt.time || (apt as any).appointment_time, '09:00'),
                    appointmentStatus: apt.status,
                    cancelledBy: apt.cancelledBy,
                  });
                }}
                className={`text-left font-extrabold text-white text-sm sm:text-base tracking-tight truncate hover:text-amber-400 hover:underline transition-colors cursor-pointer ${isCancelled ? 'line-through text-slate-500' : ''}`}
                title="Ver perfil e historial del cliente"
              >
                {apt.clientName}
              </button>
            ) : (
              <h3 className={`font-extrabold text-white text-sm sm:text-base tracking-tight truncate ${isCancelled ? 'line-through text-slate-500' : ''}`}>
                {apt.clientName}
              </h3>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5 flex-wrap">
              <span className="font-semibold text-slate-200">{apt.serviceName}</span>
              <span className="text-slate-500">·</span>
              <span>{apt.serviceDuration} min</span>
              <span className="text-slate-500">·</span>
              <span className="font-mono font-bold text-amber-400 tabular-nums">
                {formatCurrency(Number((apt as any).price ?? (apt as any).service_price ?? apt.servicePrice ?? 0))}
              </span>
            </div>

            {apt.clientNotes && (
              <p className="text-[11px] text-slate-400 mt-1 italic line-clamp-1">
                Nota: "{apt.clientNotes}"
              </p>
            )}
          </div>

          {/* Botones de Acción Rápida bien distribuidos y legibles sin apretarse */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {isConfirmed && (
              <>
                {/* Botón Iniciar en color AZUL idéntico a Presencial con icono Play blanco */}
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(apt, 'in_progress')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-500 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                  title="Iniciar atención de este cliente"
                >
                  <Play className="w-3.5 h-3.5 fill-white text-white" />
                  <span>Iniciar</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateStatus(apt, 'completed')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-700/60 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 text-xs font-bold transition-all shadow-xs cursor-pointer"
                  title="Marcar cita como completada"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Completar</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateStatus(apt, 'cancelled')}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-rose-800/60 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 text-xs font-semibold transition-all shadow-xs cursor-pointer"
                  title="Cancelar y liberar este turno"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Cancelar</span>
                </button>

                {/* Reportar inasistencia si la hora ya inició o pasó sin que el cliente asista */}
                {hasAppointmentStarted(apt.date, apt.time) && (
                  <button
                    type="button"
                    onClick={() => handleReportNoShow(apt)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/50 bg-amber-950/50 hover:bg-amber-900/70 text-amber-300 text-xs font-bold transition-all shadow-xs cursor-pointer"
                    title="El cliente no se presentó a su turno. Cerrar cita y registrar reporte por inasistencia."
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                    <span>No llegó</span>
                  </button>
                )}
              </>
            )}

            {isInProgress && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(apt, 'completed')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-md cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Terminar Corte</span>
              </button>
            )}

            {/* Botón de Llamar al Cliente a la derecha del botón Cancelar */}
            {timelineTab === 'active' &&
              !isCompleted &&
              !isCancelled &&
              (apt.status === 'confirmed' ||
                apt.status === 'in_progress' ||
                (apt as any).status === 'pending' ||
                (apt as any).status === 'CONFIRMED' ||
                (apt as any).status === 'IN_PROGRESS' ||
                (apt as any).status === 'PENDING') &&
              (apt as any).status !== 'COMPLETED' &&
              (apt as any).status !== 'CANCELLED' && (
              apt.clientPhone && apt.clientPhone !== '+57' ? (
                <a
                  href={`tel:${apt.clientPhone.replace(/[^0-9+]/g, '')}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 transition-colors shadow-xs cursor-pointer"
                  title="Llamar al cliente"
                >
                  <Phone className="w-3.5 h-3.5" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed shadow-xs"
                  title="Cliente sin teléfono registrado"
                >
                  <Phone className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!activeBarber) {
    return (
      <div className="py-20 text-center text-slate-400">
        <div className="w-8 h-8 mx-auto border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-300">Cargando panel de barbero...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Professional Header & Barber Switcher */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 ${isProfileComplete ? 'pb-5 border-b border-slate-800' : ''}`}>
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-2">
              <span className="text-xs font-bold text-amber-400 tracking-wide uppercase flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                PANEL DE CONTROL PROFESIONAL
              </span>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Sincronización de agenda en vivo
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Agenda & Disponibilidad en Tiempo Real
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Administra turnos, bloquea descansos y registra clientes presenciales.
            </p>
          </div>
        </div>

        {/* Requisito 3: OCULTAR los 3 botones de acción mientras el perfil esté incompleto */}
        {isProfileComplete && (
          <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setTargetSlotTime(undefined);
                  setIsWalkinModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-950/40 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/50 transition-colors shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Registrar Cliente Presencial</span>
              </button>

              <button
                onClick={() => {
                  setTargetSlotTime(undefined);
                  setIsBlockModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-950/40 border border-amber-500/50 text-amber-400 hover:bg-amber-900/50 transition-colors shadow-sm cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Bloquear Horario</span>
              </button>

              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-950/40 border border-rose-500/50 text-rose-400 hover:bg-rose-900/50 transition-colors shadow-sm cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Ajustar Horarios & Pausas</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Onboarding Guide para nuevos barberos sin perfil configurado (Requisito 3) */}
      {!isProfileComplete && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-400 flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>¡Bienvenido a BarberAdes! Completa la configuración de tu barbería</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-semibold">Paso 1</span>
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Configura el nombre de tu barbería, dirección, horarios de atención y tu catálogo de servicios para que tus clientes puedan reservar turnos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenBusinessProfile}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shrink-0 shadow-md cursor-pointer flex items-center gap-2 justify-center"
          >
            <Store className="w-4 h-4" />
            <span>Configurar Mis Datos</span>
          </button>
        </div>
      )}

      {/* Requisito 3: Mientras esté incompleto, OCULTAR las 4 tarjetas de resumen, la tira de días, los botones de vista y toda la cuadrícula de horarios */}
      {isProfileComplete && (
        <>
          {/* KPI Metric Strip (Tabular Figures) - Bloques oscuros de alto impacto */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Métrica 1: Turnos restantes de hoy (Requisito 4) */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Turnos restantes de hoy</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className={`text-2xl font-bold font-mono ${todayNumberColor} tabular-nums`}>
            {pendingAppointmentsCount}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            <span className="text-amber-400 font-semibold">{pendingAppointmentsCount}</span> pendientes ·{' '}
            <span className="text-emerald-400 font-semibold">{completedCount}</span> completados
          </p>
        </div>

        {/* Métrica 2: Rediseño completo de la tarjeta Próximo Cliente (Requisito 4) */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            {/* Cabecera: Título a la izquierda + Badge con hora a la derecha en el mismo renglón */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Próximo Cliente</span>
              </div>
              {nextAppointment ? (
                <span className="bg-amber-500/20 border border-amber-500/60 text-amber-300 font-extrabold px-2.5 py-0.5 rounded-lg text-sm shadow-sm font-mono tracking-tight shrink-0">
                  {formatTimeTo12h(nextAppointment.time)}
                </span>
              ) : (
                <span className="text-[11px] font-mono text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">
                  Sin citas
                </span>
              )}
            </div>

            {/* Cuerpo: Información completa en hasta 2 renglones sin truncar */}
            {nextAppointment ? (
              <div className="space-y-1 mt-1">
                {/* Renglón 1: Nombre del cliente + Nombre del servicio solicitado */}
                <div className="text-xs sm:text-sm font-bold text-white leading-snug break-words">
                  {onOpenClientProfile ? (
                    <button
                      type="button"
                      onClick={() => onOpenClientProfile({
                        name: nextAppointment.clientName,
                        email: nextAppointment.clientEmail || (nextAppointment as any).client_email,
                        phone: nextAppointment.clientPhone || (nextAppointment as any).client_phone,
                        id: nextAppointment.clientId || (nextAppointment as any).client_id,
                        appointment: nextAppointment,
                        appointmentDate: nextAppointment.date || (nextAppointment as any).appointment_date,
                        appointmentTime: normalizeTimeTo24h(nextAppointment.time || (nextAppointment as any).appointment_time, '09:00'),
                        appointmentStatus: nextAppointment.status,
                        cancelledBy: nextAppointment.cancelledBy,
                      })}
                      className="hover:text-amber-400 hover:underline transition-colors text-left cursor-pointer"
                      title="Ver perfil e historial del cliente"
                    >
                      {nextAppointment.clientName}
                    </button>
                  ) : (
                    <span>{nextAppointment.clientName}</span>
                  )}
                  <span className="text-amber-400 font-normal"> · {nextAppointment.serviceName}</span>
                </div>
                {/* Renglón 2: Nota o indicación especial dejada por el cliente (si existe) */}
                {(nextAppointment.clientNotes || nextAppointment.client_notes) ? (
                  <div className="text-[11px] text-slate-300 italic leading-snug bg-slate-800/60 px-2 py-1 rounded-md border border-slate-700/50 break-words">
                    <span className="text-slate-400 font-sans not-italic font-medium mr-1">Nota:</span>
                    "{nextAppointment.clientNotes || nextAppointment.client_notes}"
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">
                    Reserva confirmada
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic mt-1">
                Sillón disponible · Sin turnos pendientes
              </div>
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Disponibilidad</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
            {daySlots.filter((s) => s.status === 'available').length}{' '}
            <span className="text-xs font-normal text-slate-400">cupos libres</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            De {daySlots.length} horarios totales del día
          </p>
        </div>

        {/* Tarjeta de métrica Recaudación Prevista: valor en VERDE sin icono de moneda flotante */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Recaudación Prevista</span>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
            {formatCurrency(estimatedRevenue)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Suma de citas agendadas y atendidas
          </p>
        </div>
      </div>

      {/* Date Selector: Mobile 6-day 2-row grid vs Desktop Carousel */}
      <div>
        {/* Mobile: exactamente 6 días organizados en una cuadrícula de 2 filas de 3 columnas */}
        <div className="grid grid-cols-3 gap-2 sm:hidden w-full">
          {daysList.slice(0, 6).map((d) => {
            const isSelected = d.date === selectedDate;
            const aptCountForDay = effectiveAppointments.filter(
              (a) => a.barberId === activeBarber.id && a.date === d.date && a.status !== 'cancelled'
            ).length;

            return (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelectedDate(d.date)}
                className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer shadow-xs ${
                  isSelected
                    ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold shadow-md'
                    : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <div className={`text-[10px] uppercase tracking-wider ${isSelected ? 'text-slate-950 font-bold' : 'text-slate-400'}`}>
                  {d.dayName}
                </div>
                <div className={`text-xs font-bold whitespace-nowrap mt-0.5 ${isSelected ? 'text-slate-950 font-extrabold' : 'text-white'}`}>
                  {d.label} {aptCountForDay > 0 && `(${aptCountForDay})`}
                </div>
              </button>
            );
          })}
        </div>

        {/* Carrusel de Días y Conmutador de Vista (ORDEN 1) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Tablet & Desktop: Carrusel horizontal */}
          <div className="hidden sm:flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none flex-1 min-w-0">
            {daysList.map((d) => {
              const isSelected = d.date === selectedDate;
              const aptCountForDay = effectiveAppointments.filter(
                (a) => a.barberId === activeBarber.id && a.date === d.date && a.status !== 'cancelled'
              ).length;

              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setSelectedDate(d.date)}
                  className={`shrink-0 px-4 py-2 rounded-xl border text-center transition-all cursor-pointer shadow-xs ${
                    isSelected
                      ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold shadow-md'
                      : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <div className={`text-[10px] uppercase tracking-wider ${isSelected ? 'text-slate-950 font-bold' : 'text-slate-400'}`}>
                    {d.dayName}
                  </div>
                  <div className={`text-xs font-bold whitespace-nowrap mt-0.5 ${isSelected ? 'text-slate-950 font-extrabold' : 'text-white'}`}>
                    {d.label} {aptCountForDay > 0 && `(${aptCountForDay})`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Conmutadores de Vista: 100% visible en todas las resoluciones (móvil, tablet y PC) */}
          <div className="flex w-full sm:w-auto justify-center bg-[#0B0F17] p-1 rounded-xl border border-slate-800 shrink-0 mt-8 sm:mt-0">
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`flex-1 sm:flex-initial text-center py-2 px-4 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'matrix' || viewMode === 'grid'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              Matriz de Horarios
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`flex-1 sm:flex-initial text-center py-2 px-4 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              Lista Cronológica
            </button>
          </div>
        </div>
      </div>

      {/* Main Schedule Content */}
      {viewMode === 'timeline' ? (
        /* Timeline List View con Pestañas [Turnos del Día] y [Historial & Cierres] (Requisito 6) */
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-amber-400 tracking-tight">
                  Agenda del Día ({formatDateLabel(selectedDate)})
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedDate(selectedDate === yesterdayDateStr ? (todayStr || '') : yesterdayDateStr)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedDate === yesterdayDateStr
                      ? 'bg-rose-950/90 text-rose-300 border-rose-500 font-bold shadow-xs'
                      : 'bg-rose-950/40 text-rose-400 border-rose-500/50 hover:bg-rose-900/50 hover:text-rose-300'
                  }`}
                  title="Consultar y cerrar citas del día anterior"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>{selectedDate === yesterdayDateStr ? 'Viendo: Ayer' : `Ayer (${formatDateLabel(yesterdayDateStr)})`}</span>
                </button>
                {selectedDate !== todayStr && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayStr || '')}
                    className="px-2 py-1 rounded-lg text-xs font-medium text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                  >
                    Volver a Hoy
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeDayAppointments.length} turnos activos pendientes · {historyDayAppointments.length} en historial
              </p>
            </div>

            {/* Selector de Pestañas: [Turnos del Día] vs [Historial & Cierres] */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold shadow-xs">
              <button
                type="button"
                onClick={() => setTimelineTab('active')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  timelineTab === 'active'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Turnos del Día ({activeDayAppointments.length})</span>
              </button>

              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setTimelineTab('history')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    timelineTab === 'history'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Historial de Citas ({historyDayAppointments.length})</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTimelineTab('history');
                    setHistorySortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                  }}
                  className={`ml-1 p-1.5 rounded-lg border transition-all cursor-pointer ${
                    timelineTab === 'history'
                      ? 'bg-slate-900 text-amber-400 border-slate-700 hover:bg-slate-800 hover:text-amber-300'
                      : 'text-slate-400 hover:text-white border-transparent hover:bg-slate-900'
                  }`}
                  title={`Alternar orden: ${historySortOrder === 'asc' ? 'Ascendente (▲)' : 'Descendente (▼)'}`}
                  aria-label="Alternar orden del historial"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {timelineTab === 'active' ? (
            /* Pestaña: Turnos Activos del Día */
            activeDayAppointments.length === 0 ? (
              !isProfileCompleted && totalBarberAppointments === 0 ? (
                /* Requisito 2: Estado vacío amigable para barberos nuevos (solo si perfil incompleto) */
                <div className="text-center py-12 sm:py-16 px-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4 shadow-lg shadow-amber-950/20">
                    <Store className="w-7 h-7" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">
                    ¡Bienvenido a tu panel de control!
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
                    Aún no tienes citas agendadas ni has publicado tu local. Configura tu información en 'Mi Negocio' para que los clientes puedan empezar a reservar.
                  </p>
                  {onOpenBusinessProfile && (
                    <button
                      type="button"
                      onClick={onOpenBusinessProfile}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-amber-950/40 cursor-pointer"
                    >
                      <Store className="w-4 h-4" />
                      <span>Configurar Mi Negocio</span>
                    </button>
                  )}
                </div>
              ) : (
                /* Requisito 2: Lista de citas limpia ("Sin citas agendadas para hoy") cuando el perfil esté completado */
                <div className="text-center py-12 px-4 rounded-xl bg-slate-950/40 border border-slate-800/60 text-slate-400">
                  <Calendar className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                  <p className="text-sm font-bold text-slate-300">
                    Sin citas agendadas para hoy ({formatDateLabel(selectedDate)})
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {historyDayAppointments.length > 0
                      ? 'Todos los turnos de este día han sido completados o cancelados (puedes revisarlos en la pestaña Historial).'
                      : 'Los clientes pueden reservar desde el portal en vivo o puedes registrar una cita presencial.'}
                  </p>
                </div>
              )
            ) : (
              <div className="space-y-3">
                {/* Por defecto muestra únicamente las 3 citas más próximas */}
                {(showAllActiveAppointments
                  ? activeDayAppointments
                  : activeDayAppointments.slice(0, 3)
                ).map((apt) => renderAppointmentCard(apt))}

                {/* Botón desplegable si existen más de 3 turnos activos */}
                {activeDayAppointments.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllActiveAppointments(!showAllActiveAppointments)}
                    className="w-full py-3 px-4 rounded-xl border border-slate-800 bg-slate-900/90 hover:bg-slate-800 hover:border-amber-500/50 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    {showAllActiveAppointments ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        <span>Colapsar a las 3 citas más próximas</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        <span>Ver {activeDayAppointments.length - 3} citas restantes del día</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )
          ) : (
            /* Pestaña: Historial & Cierres (Turnos completados y cancelados) */
            historyDayAppointments.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <History className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-300">
                  No hay citas registradas en el historial para {formatDateLabel(selectedDate)}.
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Los turnos completados y cancelados pasan automáticamente aquí para mantener limpia la agenda activa.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Cabecera sutil con alternador de orden Ascendente / Descendente */}
                <div className="flex items-center justify-between px-1 text-xs text-slate-400 pb-1 border-b border-slate-800/60">
                  <span>Citas registradas ({historyDayAppointments.length})</span>
                  <button
                    type="button"
                    onClick={() => setHistorySortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border border-slate-800 transition-colors cursor-pointer text-[11px] font-medium"
                    title="Alternar orden cronológico de las citas"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
                    <span>{historySortOrder === 'asc' ? 'Hora Ascendente (▲)' : 'Hora Descendente (▼)'}</span>
                  </button>
                </div>

                {/* Por defecto muestra únicamente los primeros 3 registros del historial */}
                {(showAllHistory
                  ? sortedHistoryAppointments
                  : sortedHistoryAppointments.slice(0, 3)
                ).map((apt) => renderAppointmentCard(apt))}

                {/* Botón desplegable si existen más de 3 turnos en el historial */}
                {historyDayAppointments.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllHistory(!showAllHistory)}
                    className="w-full py-3 px-4 rounded-xl border border-slate-800 bg-slate-900/90 hover:bg-slate-800 hover:border-amber-500/50 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    {showAllHistory ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        <span>▲ Colapsar a los 3 registros principales</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        <span>▼ Ver {historyDayAppointments.length - 3} registros más en el historial</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )
          )}
        </div>
      ) : (
        /* Real-Time Grid Matrix View */
        <div className="bg-[#0B0F17]/95 border border-slate-800 rounded-2xl p-3.5 sm:p-5 space-y-3 shadow-xl backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight whitespace-nowrap">
              Matriz Completa ({formatDateLabel(selectedDate)})
            </h2>
            <div className="flex items-center gap-3 text-[11px] sm:text-xs shrink-0">
              {/* 1. Verde (Libre) */}
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 border border-emerald-400" />
                <span className="font-semibold text-slate-300">Libre</span>
              </span>
              {/* 2. Amarillo/Naranja (Bloqueado) */}
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 border border-amber-400" />
                <span className="font-semibold text-slate-300">Bloqueado</span>
              </span>
              {/* 3. Rojo (Ocupado) */}
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 border border-rose-400" />
                <span className="font-semibold text-slate-300">Ocupado</span>
              </span>
              {/* 4. Esmeralda oscuro (Completado) */}
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-800 border border-emerald-600" />
                <span className="font-semibold text-slate-300">Completado</span>
              </span>
            </div>
          </div>

          {!isProfileCompleted ? (
            /* Requisito 3: Matriz de Horarios en blanco si el perfil no está terminado */
            <div className="text-center py-16 px-4 rounded-xl bg-slate-950/80 border border-slate-800/80">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4 shadow-lg shadow-amber-950/20">
                <Clock className="w-7 h-7" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white mb-2">
                Matriz de Horarios en Espera
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
                La matriz de horarios se activará automáticamente cuando completes la información de tu negocio y catálogo de servicios en 'Mi Negocio / Perfil'.
              </p>
              {onOpenBusinessProfile && (
                <button
                  type="button"
                  onClick={onOpenBusinessProfile}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-lg shadow-amber-950/40 cursor-pointer"
                >
                  <Store className="w-4 h-4" />
                  <span>Completar Mi Negocio / Perfil</span>
                </button>
              )}
            </div>
          ) : daySlots.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <Coffee className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                Día de Descanso Programado
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                No hay turnos disponibles para el {formatDateLabel(selectedDate)} según tu configuración de disponibilidad semanal.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {daySlots.map((slot) => {
                const isAvailable = slot.status === 'available';
                const isBooked = slot.status === 'booked';
                const isBlocked = slot.status === 'blocked';
                const isPast = slot.status === 'past';
                // Requisito 2: Si la cita asociada tiene status === 'completed', se muestra en VERDE con badge COMPLETADO
                const isCompleted = isBooked && slot.appointment?.status === 'completed';

                return (
                  <div
                    key={slot.time}
                    onClick={
                      isBooked && slot.appointment
                        ? () => handleNavigateToAppointment(slot.appointment!.id)
                        : undefined
                    }
                    className={`p-3 rounded-xl border text-xs transition-all relative flex flex-col justify-between min-h-[96px] ${
                      isCompleted
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-slate-200 cursor-pointer hover:ring-2 hover:ring-emerald-500 hover:border-emerald-500 hover:scale-[1.02] shadow-sm group'
                        : isBooked && slot.appointment
                        ? 'bg-rose-950/30 border-rose-800/70 text-slate-200 cursor-pointer hover:ring-2 hover:ring-rose-500 hover:border-rose-500 hover:scale-[1.02] shadow-sm group'
                        : isBooked
                        ? 'bg-rose-950/25 border-rose-800/50 text-slate-200'
                        : isBlocked
                        ? 'bg-amber-950/30 border-amber-500/50 text-amber-300 shadow-sm'
                        : isPast
                        ? 'bg-slate-900/50 border-slate-800/50 text-slate-500 opacity-60'
                        : 'bg-slate-900/95 border-slate-800 hover:border-emerald-500 text-slate-300 shadow-xs'
                    }`}
                    title={
                      isBooked && slot.appointment
                        ? 'Haz clic para ver y gestionar esta cita en la Lista Cronológica'
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-white">{formatTimeTo12h(slot.time)}</span>
                      <span
                        title={isBlocked ? resolveSlotBlockedReason(slot) : undefined}
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border max-w-[120px] truncate ${
                          isCompleted
                            ? 'text-emerald-400 bg-emerald-950/80 border-emerald-500/50'
                            : isBooked
                            ? 'text-rose-400 bg-rose-950/60 border-rose-800/60'
                            : isBlocked
                            ? 'text-amber-400 bg-amber-950/60 border-amber-500/50'
                            : isPast
                            ? 'text-slate-500 bg-slate-900/60 border-slate-800'
                            : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60'
                        }`}
                      >
                        {isCompleted
                          ? 'Completado'
                          : isBooked
                          ? 'Ocupado'
                          : isBlocked
                          ? 'Bloqueado'
                          : isPast
                          ? 'Pasado'
                          : 'Libre'}
                      </span>
                    </div>

                    {/* Texto siempre visible para cliente y servicio en turnos agendados y completados (Límite estricto 30 caracteres) */}
                    {isBooked && slot.appointment && (
                      <div className="mt-1.5 min-w-0">
                        {onOpenClientProfile ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenClientProfile({
                                name: slot.appointment!.clientName,
                                email: slot.appointment!.clientEmail || (slot.appointment as any)!.client_email,
                                phone: slot.appointment!.clientPhone || (slot.appointment as any)!.client_phone,
                                id: slot.appointment!.clientId || (slot.appointment as any)!.client_id,
                                appointment: slot.appointment,
                                appointmentDate: slot.appointment!.date || (slot.appointment as any)!.appointment_date,
                                appointmentTime: normalizeTimeTo24h(slot.appointment!.time || (slot.appointment as any)!.appointment_time, '09:00'),
                                appointmentStatus: slot.appointment!.status,
                                cancelledBy: slot.appointment!.cancelledBy,
                              });
                            }}
                            className="font-bold text-white text-xs truncate block max-w-full hover:text-amber-400 hover:underline transition-colors text-left cursor-pointer"
                            title="Ver perfil e historial del cliente"
                          >
                            {(slot.appointment.clientName || '').slice(0, 30)}
                          </button>
                        ) : (
                          <p className="font-bold text-white text-xs truncate block max-w-full">
                            {(slot.appointment.clientName || '').slice(0, 30)}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-300 truncate font-medium block max-w-full mt-0.5">
                          {(slot.appointment.serviceName || '').slice(0, 30)}
                        </p>
                        <div className={`flex items-center gap-1 text-[10px] ${isCompleted ? 'text-emerald-400' : 'text-rose-400'} font-bold mt-1.5`}>
                          <span>Ver en lista</span>
                          <ArrowRight className="w-3 h-3" />
                        </div>
                      </div>
                    )}

                    {/* Requisito 2: Motivo específico en el cuerpo interno sin sustituir la etiqueta BLOQUEADO (Límite 30 caracteres) */}
                    {isBlocked && (
                      <div className="mt-1.5 min-w-0">
                        <p
                          className="text-[11px] text-amber-300 font-medium leading-snug line-clamp-2 max-w-full break-words"
                          title={resolveSlotBlockedReason(slot)}
                        >
                          {(resolveSlotBlockedReason(slot) || '').slice(0, 30)}
                        </p>
                        <button
                          onClick={() => handleUnblockSlot(slot)}
                          className="mt-1.5 text-[10px] text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer font-bold transition-colors"
                          title="Desbloquear este horario"
                        >
                          <Unlock className="w-3 h-3 text-amber-400" />
                          <span>Desbloquear</span>
                        </button>
                      </div>
                    )}

                    {isAvailable && (
                      <div className="mt-2 flex gap-1.5">
                        <button
                          onClick={() => {
                            setTargetSlotTime(slot.time);
                            setIsWalkinModalOpen(true);
                          }}
                          className="w-1/2 py-1.5 px-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold text-center transition-all shadow-xs cursor-pointer"
                          title="Agendar presencial"
                        >
                          + Cita
                        </button>
                        <button
                          onClick={() => {
                            setQuickBlockSlot({ date: selectedDate, time: slot.time });
                            setQuickBlockReason('Descanso / Almuerzo');
                            setQuickBlockCustomReason('');
                          }}
                          className="w-1/2 py-1.5 px-1 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 hover:border-amber-500/50 rounded-lg text-[10px] font-bold text-center transition-all shadow-xs cursor-pointer"
                          title="Bloquear este horario"
                        >
                          Bloquear
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
        </>
      )}

      {/* Requisito 3: Modal de Bloqueo Rápido para turnos individuales */}
      {quickBlockSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-[#12151b] border border-amber-500/40 rounded-2xl p-5 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                  <Ban className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Bloqueo Rápido de Turno</h3>
                  <p className="text-[11px] text-amber-400 font-medium">
                    {formatDateLabel(quickBlockSlot.date)} · {formatTimeTo12h(quickBlockSlot.time)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickBlockSlot(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Cerrar modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Motivo del Bloqueo:
              </label>
              <select
                value={quickBlockReason}
                onChange={(e) => setQuickBlockReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition-colors shadow-xs cursor-pointer"
              >
                <option value="Descanso / Almuerzo">Descanso / Almuerzo</option>
                <option value="Trámite o Turno Médico">Trámite o Turno Médico</option>
                <option value="Mantenimiento y Afilado de Navajas">Mantenimiento y Afilado de Navajas</option>
                <option value="Pausa Personal">Pausa Personal</option>
                <option value="Capacitación / Masterclass">Capacitación / Masterclass</option>
                <option value="Otro motivo...">Otro motivo...</option>
              </select>

              {quickBlockReason === 'Otro motivo...' && (
                <input
                  type="text"
                  placeholder="Especifica el motivo..."
                  value={quickBlockCustomReason}
                  onChange={(e) => setQuickBlockCustomReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors shadow-xs"
                  autoFocus
                />
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setQuickBlockSlot(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingQuickBlock}
                onClick={handleConfirmQuickBlock}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-amber-950/40 cursor-pointer disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isSavingQuickBlock ? 'Bloqueando...' : 'Confirmar Bloqueo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block Slot Modal (Rango de Horarios) */}
      <BlockSlotModal
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        barber={activeBarber}
        date={selectedDate}
        defaultTime={targetSlotTime || '13:30'}
        appointments={effectiveAppointments}
        onSlotBlocked={(newSlots) => {
          if (newSlots && newSlots.length > 0) {
            setCurrentBlockedSlots((prev) => {
              const ids = new Set(newSlots.map((s) => s.id));
              return [...prev.filter((p) => !ids.has(p.id)), ...newSlots];
            });
          }
          onRefreshData();
        }}
      />

      {/* Add Walk-in Modal */}
      <AddWalkinModal
        isOpen={isWalkinModalOpen}
        onClose={() => setIsWalkinModalOpen(false)}
        barber={activeBarber}
        services={services}
        date={selectedDate}
        defaultTime={targetSlotTime || '12:00'}
        onAppointmentAdded={handleAppointmentAdded}
      />

      {/* Availability Settings Modal */}
      <BarberAvailabilitySettings
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        barber={activeBarber}
        onSaved={onRefreshData}
      />



      {/* Modal de Confirmación de Cancelación de Turno */}
      {appointmentToCancel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#12151b] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">
                  ¿Deseas cancelar y liberar este turno?
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Esta cancelación no reporta, penaliza ni bloquea al usuario; el horario quedará disponible inmediatamente para nuevos clientes o citas presenciales.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Cliente:</span>
                <span className="font-bold text-white">{appointmentToCancel.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Servicio:</span>
                <span className="font-semibold text-slate-200">{appointmentToCancel.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fecha y Horario:</span>
                <span className="font-mono font-bold text-amber-400">
                  {formatDateLabel(appointmentToCancel.date)} · {formatTimeTo12h(appointmentToCancel.time)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Código de cita:</span>
                <span className="font-mono text-slate-300">
                  {formatBookingCode(appointmentToCancel.code, 'CO')}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAppointmentToCancel(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                No, volver
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-950/40 cursor-pointer"
              >
                Sí, Cancelar y Liberar Turno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Undo Toast (Visible durante 8 segundos tras cancelar) */}
      {undoToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom duration-300 max-w-md">
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-900 border border-amber-500/50 shadow-2xl shadow-black/90 text-xs text-white">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="flex-1">
              Turno de <strong className="text-amber-300">{undoToast.appointment.clientName}</strong> cancelado.
            </span>
            <button
              type="button"
              onClick={handleUndoCancel}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer shrink-0 shadow-md shadow-amber-950/30"
            >
              Deshacer
            </button>
            <button
              type="button"
              onClick={() => {
                if (undoToast.timeoutId) clearTimeout(undoToast.timeoutId);
                setUndoToast(null);
              }}
              className="text-slate-400 hover:text-white p-1 ml-0.5 cursor-pointer"
              aria-label="Cerrar notificación"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Requisito 6: Alerta visual flotante en tiempo real para el Barbero al recibir nuevas reservas */}
      {newBookingAlert && (
        <div className="fixed bottom-6 left-6 z-50 animate-in slide-in-from-bottom duration-300 max-w-sm sm:max-w-md">
          <div className="flex items-center gap-3.5 p-4 rounded-xl bg-slate-900/95 backdrop-blur-md border-2 border-amber-500 shadow-2xl shadow-amber-500/20 text-white">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-amber-400 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  ¡Nueva Reserva!
                </span>
                {newBookingAlert.time && (
                  <span className="text-xs font-mono font-bold text-slate-300">
                    {formatTimeTo12h(newBookingAlert.time)}
                  </span>
                )}
              </div>
              <p className="font-bold text-sm text-white truncate mt-0.5">
                {newBookingAlert.clientName}
              </p>
              <p className="text-xs text-slate-300 truncate font-medium">
                {newBookingAlert.serviceName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (newBookingAlert.timeoutId) clearTimeout(newBookingAlert.timeoutId);
                setNewBookingAlert(null);
              }}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              aria-label="Cerrar notificación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {actionToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 backdrop-blur-md border border-amber-500/50 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium text-slate-100">{actionToast}</span>
        </div>
      )}
    </div>
  );
};
