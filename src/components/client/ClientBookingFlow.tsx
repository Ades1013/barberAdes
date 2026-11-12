import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Barber, Service, Appointment, BlockedSlot, User as UserType } from '../../types';
import { getNextDays, getDayName, generateDailySlots, formatCurrency, formatDateLabel, formatTimeTo12h, formatScheduleDisplay, TimeSlotStatus, generateWhatsAppLink, generateNextBookingCode, formatBookingCode, normalizeTime, normalizeTimeTo24h, normalizeWorkingDaysToNumbers, getFrequencyRestrictedDates, isAppointmentCancellableByClient } from '../../utils/dateUtils';
import { storageService } from '../../services/storageService';
import { realtimeService } from '../../services/realtimeService';
import { supabase } from '../../services/supabaseClient';
import { Star, Clock, Check, Calendar, User, Phone, Sparkles, AlertCircle, ShieldCheck, Lock, MessageCircle, X, CheckCircle2, Scissors, UserCheck, Search, MapPin, ExternalLink, Building2, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { PhoneInputWithCountry, validatePhoneDigits } from '../common/PhoneInputWithCountry';
import { ClientPublicLanding } from './ClientPublicLanding';
import { getSocialDeepLink } from '../barber/ProfilePreviewModal';
import { BarberOfficialCardView } from '../barber/BarberPublicCard';

interface ClientBookingFlowProps {
  barbers: Barber[];
  services: Service[];
  appointments: Appointment[];
  blockedSlots: BlockedSlot[];
  currentUser: UserType | null;
  targetBarberId?: string | null;
  isBarbersLoaded?: boolean;
  onOpenAuthModal: () => void;
  onBookingComplete: (newAppointment: Appointment) => void;
  onRefreshData?: () => void;
}

export const ClientBookingFlow: React.FC<ClientBookingFlowProps> = ({
  barbers: propBarbers,
  services: propServices,
  appointments,
  blockedSlots,
  currentUser,
  targetBarberId,
  isBarbersLoaded = true,
  onOpenAuthModal,
  onBookingComplete,
  onRefreshData,
}) => {
  const barbers = useMemo(
    () => (propBarbers && propBarbers.length > 0 ? propBarbers : storageService.getCachedBarbers()),
    [propBarbers]
  );
  const services = useMemo(
    () => (propServices && propServices.length > 0 ? propServices : storageService.getServices()),
    [propServices]
  );

  // Requisito 2: Estado de carga inicial con bloque try / catch / finally que garantiza setLoading(false) SIEMPRE
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const initBarbersAndAvailability = async () => {
      setLoading(true);
      try {
        if (onRefreshData && (propBarbers.length === 0 || propServices.length === 0 || !isBarbersLoaded)) {
          await Promise.resolve(onRefreshData());
        }
      } catch (err) {
        console.warn('Error loading initial barbers and availability:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    initBarbersAndAvailability();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  // STRICT SECURITY GUARD: If visitor is not authenticated, render the public informative landing page
  if (!currentUser) {
    return (
      <ClientPublicLanding
        onOpenAuthModal={onOpenAuthModal}
        barbers={barbers}
        services={services}
      />
    );
  }

  // Step selections
  const [selectedBarberId, setSelectedBarberId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');

  // Barbero habitual / última cita para el usuario autenticado
  const [habitualBarber, setHabitualBarber] = useState<Barber | null>(null);
  const qrAutoSelectedRef = useRef<boolean>(false);

  // Consulta estricta de historial de citas en public.appointments para identificar el barbero habitual
  const lastResolvedUserIdRef = useRef<string | null>(null);
  React.useEffect(() => {
    if (!currentUser || !currentUser.id) {
      lastResolvedUserIdRef.current = null;
      qrAutoSelectedRef.current = false;
      setHabitualBarber(null);
      setSelectedBarberId('');
      return;
    }

    const activeUser = currentUser;
    const isUserChanged = lastResolvedUserIdRef.current !== activeUser.id;
    const hasPendingQrTarget = Boolean(
      targetBarberId ||
        (typeof window !== 'undefined' &&
          (new URLSearchParams(window.location.search).get('barber') ||
            localStorage.getItem('barberades_qr_barber')))
    );

    if (isUserChanged) {
      lastResolvedUserIdRef.current = activeUser.id;
      setHabitualBarber(null);
      if (!qrAutoSelectedRef.current && !hasPendingQrTarget) {
        setSelectedBarberId('');
      }
    }

    let isMounted = true;
    async function resolveHabitualBarber() {
      try {
        // Consultar estrictamente en public.appointments el historial del usuario autenticado
        const historyRows = await storageService.getUserAppointmentHistory(activeUser.id);
        const foundBarberId = historyRows.length > 0 ? String(historyRows[0].barber_id || '') : null;

        if (!isMounted) return;

        if (foundBarberId) {
          const barberObj = barbers.find((b) => b.id === foundBarberId || b.user_id === foundBarberId || b.userId === foundBarberId);
          if (barberObj) {
            setHabitualBarber((prev) => (prev?.id === barberObj.id ? prev : barberObj));
            if (!qrAutoSelectedRef.current && !hasPendingQrTarget) {
              setSelectedBarberId((prev) => (prev ? prev : barberObj.id));
            }
          } else {
            setHabitualBarber(null);
            if (isUserChanged && !qrAutoSelectedRef.current && !hasPendingQrTarget) {
              setSelectedBarberId('');
            }
          }
        } else {
          // Cuenta sin citas previas en public.appointments: selección completamente en blanco y sin etiqueta Habitual
          setHabitualBarber(null);
          if (isUserChanged && !qrAutoSelectedRef.current && !hasPendingQrTarget) {
            setSelectedBarberId('');
          }
        }
      } catch {
        if (isMounted) {
          setHabitualBarber(null);
          if (isUserChanged && !qrAutoSelectedRef.current && !hasPendingQrTarget) {
            setSelectedBarberId('');
          }
        }
      }
    }

    resolveHabitualBarber();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, barbers, targetBarberId]);

  // Regla 1: Búsqueda en vivo y proximidad
  const [barberSearchQuery, setBarberSearchQuery] = useState<string>('');
  const [proximityAddress, setProximityAddress] = useState<string>('');

  // Deduplicación garantizada en el cliente: conservar únicamente el registro principal con alias ("El Mocha Orejas")
  const uniqueBarbers = useMemo(() => {
    const map = new Map<string, Barber>();
    for (const b of barbers) {
      if (!b) continue;
      const key =
        (b.email || '').trim().toLowerCase() ||
        (b.name || '').trim().toLowerCase() ||
        b.id;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, b);
      } else {
        const bAlias = String(b.alias || b.nickname || '').trim();
        const exAlias = String(existing.alias || existing.nickname || '').trim();
        if (bAlias && !exAlias) {
          map.set(key, b);
        }
      }
    }
    return Array.from(map.values());
  }, [barbers]);

  // Barberos filtrados según término ingresado (inicia completamente vacío)
  const matchingBarbers = useMemo(() => {
    const q = barberSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return uniqueBarbers.filter((b) => {
      const matchName = b.name.toLowerCase().includes(q);
      const nick = b.alias || b.nickname || '';
      const matchNick = nick ? nick.toLowerCase().includes(q) : false;
      const matchSpec = b.specialty ? b.specialty.toLowerCase().includes(q) : false;
      const shop = b.business_name || b.businessName || b.barbershopName || '';
      const matchShop = shop ? shop.toLowerCase().includes(q) : false;
      return matchName || matchNick || matchSpec || matchShop;
    });
  }, [uniqueBarbers, barberSearchQuery]);

  // Barbero actualmente seleccionado (si existe), resolviendo IDs unificados
  const currentBarber = useMemo(() => {
    if (!selectedBarberId) return null;
    const unifiedId = storageService.resolveUnifiedBarberId(selectedBarberId);
    return (
      uniqueBarbers.find(
        (b) =>
          b.id === unifiedId ||
          b.id === selectedBarberId ||
          b.user_id === selectedBarberId ||
          b.userId === selectedBarberId
      ) ||
      barbers.find(
        (b) =>
          b.id === unifiedId ||
          b.id === selectedBarberId ||
          b.user_id === selectedBarberId ||
          b.userId === selectedBarberId
      ) ||
      null
    );
  }, [uniqueBarbers, barbers, selectedBarberId]);

  // Regla 2: Catálogo dinámico por profesional
  const filteredServices = useMemo(() => {
    if (!currentBarber) return [];
    if (Array.isArray(currentBarber.services) && currentBarber.services.length > 0) {
      return currentBarber.services;
    }
    if (currentBarber.serviceIds && currentBarber.serviceIds.length > 0) {
      const matchedByIds = services.filter((s) => currentBarber.serviceIds!.includes(s.id));
      if (matchedByIds.length > 0) return matchedByIds;
    }
    return services.filter((s) => {
      if (s.barberId) {
        return (
          s.barberId === currentBarber.id ||
          s.barberId === currentBarber.user_id ||
          s.barberId === currentBarber.userId
        );
      }
      if (s.barbershopName && currentBarber.barbershopName) {
        return s.barbershopName === currentBarber.barbershopName;
      }
      return true;
    });
  }, [services, currentBarber]);

  // Auto-selección de la ficha del barbero desde enlace directo / Código QR (?barber=ID)
  useEffect(() => {
    if (!currentUser || loading || !isBarbersLoaded || barbers.length === 0) return;

    const effectiveTargetId =
      targetBarberId ||
      (typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('barber') ||
          localStorage.getItem('barberades_qr_barber')
        : null);

    if (!effectiveTargetId) return;

    const matchedBarber = barbers.find(
      (b) =>
        b.id === effectiveTargetId ||
        b.user_id === effectiveTargetId ||
        b.userId === effectiveTargetId
    );

    if (matchedBarber) {
      qrAutoSelectedRef.current = true;
      setBarberSearchQuery('');
      setSelectedBarberId(matchedBarber.id);
      setSelectedTime(null);

      // Seleccionar inmediatamente el primer servicio del barbero si tiene catálogo propio
      const barberCatalog =
        Array.isArray(matchedBarber.services) && matchedBarber.services.length > 0
          ? matchedBarber.services
          : matchedBarber.serviceIds && matchedBarber.serviceIds.length > 0
          ? services.filter((s) => matchedBarber.serviceIds!.includes(s.id))
          : services.filter((s) => !s.barberId || s.barberId === matchedBarber.id || s.barberId === matchedBarber.user_id || s.barberId === matchedBarber.userId);

      if (barberCatalog.length > 0) {
        setSelectedServiceId(barberCatalog[0].id);
      }

      // Eliminar barberades_qr_barber de localStorage y limpiar query param de la URL
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('barberades_qr_barber');
        } catch {}
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('barber');
          const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch {}
      }

      // Scroll suave hacia la sección de reserva para mostrar la ficha del barbero y sus servicios
      setTimeout(() => {
        const el = document.getElementById('step-barber');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    }
  }, [currentUser, loading, isBarbersLoaded, barbers, services, targetBarberId]);

  // Sincronizar servicio seleccionado con el catálogo del barbero
  React.useEffect(() => {
    if (filteredServices.length > 0) {
      if (!selectedServiceId || !filteredServices.some((s) => s.id === selectedServiceId)) {
        setSelectedServiceId(filteredServices[0].id);
      }
    } else {
      setSelectedServiceId((prev) => (prev !== '' ? '' : prev));
    }
  }, [filteredServices, selectedServiceId]);

  const currentService = useMemo(
    () => filteredServices.find((s) => s.id === selectedServiceId) || filteredServices[0] || null,
    [filteredServices, selectedServiceId]
  );

  // Citas locales y sincronizadas con Supabase en tiempo real
  const [localApts, setLocalApts] = useState<Appointment[]>(() => storageService.getCachedAppointments());
  const [cancelledIds, setCancelledIds] = useState<Set<string>>(() => new Set());
  const [lastCancelledApt, setLastCancelledApt] = useState<Appointment | null>(null);

  // Fusión garantizada: citas locales recién creadas + citas del servidor, excluyendo en 0ms las recién canceladas
  const effectiveAppointments = useMemo(() => {
    const merged = storageService.mergeAppointments(localApts, appointments);
    if (cancelledIds.size === 0) return merged;
    return merged.filter((a) => !cancelledIds.has(a.id));
  }, [localApts, appointments, cancelledIds]);

  // Citas Activas: Consulta 'public.appointments' por 'client_email', 'client_id' y 'barber_id' unificado
  const loadAppointments = useCallback(async () => {
    try {
      const filters: string[] = [];
      if (currentUser?.id) {
        filters.push(`client_id.eq.${currentUser.id}`);
      }
      if (currentUser?.email) {
        filters.push(`client_email.ilike.${currentUser.email.trim().toLowerCase()}`);
      }
      if (selectedBarberId) {
        const unifiedBId = storageService.resolveUnifiedBarberId(selectedBarberId);
        filters.push(`barber_id.eq.${unifiedBId}`);
        if (unifiedBId !== selectedBarberId) {
          filters.push(`barber_id.eq.${selectedBarberId}`);
        }
      }

      const query = supabase.from('appointments').select('*');
      const { data, error } = filters.length > 0 ? await query.or(filters.join(',')) : await query;

      if (!error && data) {
        const mapped = data.map((row) => storageService.mapFromDbAppointment(row));
        setLocalApts((prev) => {
          const merged = storageService.mergeAppointments(prev, mapped);
          storageService.saveAppointments(merged);
          return merged;
        });
      }
    } catch (err) {
      console.warn('Error fetching client appointments from cloud:', err);
    }
  }, [currentUser?.id, currentUser?.email, selectedBarberId]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // Suscripción en tiempo real multi-pestaña y multi-dispositivo para citas
  useEffect(() => {
    const handleSync = () => {
      setLocalApts(storageService.getCachedAppointments());
    };
    window.addEventListener('storage', handleSync);
    window.addEventListener('barbersync_appointment_sync', handleSync);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('barbersync_channel');
      channel.onmessage = handleSync;
    } catch {}

    const realtimeChannel = supabase
      .channel('appointments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload: any) => {
        if (payload?.new) {
          const mapped = storageService.mapFromDbAppointment(payload.new);
          if (mapped.status === 'cancelled') {
            setCancelledIds((prev) => {
              const next = new Set(prev);
              next.add(mapped.id);
              return next;
            });
            setLocalApts((prev) => prev.filter((a) => a.id !== mapped.id));
          } else {
            setLocalApts((prev) => {
              const merged = storageService.mergeAppointments(prev, [mapped]);
              storageService.saveAppointments(merged);
              return merged;
            });
          }
        }
        if (payload?.eventType === 'DELETE' && payload.old?.id) {
          const deletedId = String(payload.old.id);
          setCancelledIds((prev) => {
            const next = new Set(prev);
            next.add(deletedId);
            return next;
          });
          setLocalApts((prev) => prev.filter((a) => a.id !== deletedId));
        }
        loadAppointments();
        if (onRefreshData) onRefreshData();
      })
      .subscribe();

    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('barbersync_appointment_sync', handleSync);
      if (channel) channel.close();
      try {
        realtimeChannel.unsubscribe();
        supabase.removeChannel(realtimeChannel);
      } catch {}
    };
  }, [loadAppointments, onRefreshData]);

  // Restricción de 6 días: Inhabilita los 6 días posteriores a una cita previa del cliente
  const frequencyRestrictions = useMemo(() => {
    return getFrequencyRestrictedDates(
      effectiveAppointments,
      currentUser?.id,
      currentUser?.email,
      currentUser?.phone
    );
  }, [effectiveAppointments, currentUser?.id, currentUser?.email, currentUser?.phone]);
  
  // Días laborables del barbero en formato numérico (0=Dom, 1=Lun, ..., 6=Sáb)
  const barberWorkingDayNumbers = useMemo(() => {
    if (!currentBarber) return [1, 2, 3, 4, 5, 6];
    const raw =
      currentBarber.workingHours?.workingDays ||
      (currentBarber.schedule as any)?.working_days ||
      (currentBarber.schedule as any)?.work_days ||
      (currentBarber.schedule as any)?.workingDaysArray ||
      (currentBarber as any)?.working_days;
    const rawText =
      currentBarber.workingDaysText ||
      currentBarber.workingDays ||
      currentBarber.schedule?.workingDays ||
      (currentBarber.schedule as any)?.working_days_text ||
      'Lunes a Sábado';
    return normalizeWorkingDaysToNumbers(raw, String(rawText));
  }, [currentBarber]);

  // Límite estricto de 31 días hábiles contados a partir de la fecha actual
  const maxWorkingDayDateStr = useMemo(() => {
    const today = new Date();
    const curr = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
    let workingDaysFound = 0;
    while (workingDaysFound < 31) {
      const dayOfWeek = curr.getDay();
      if (barberWorkingDayNumbers.includes(dayOfWeek)) {
        workingDaysFound++;
        if (workingDaysFound === 31) {
          const y = curr.getFullYear();
          const m = String(curr.getMonth() + 1).padStart(2, '0');
          const d = String(curr.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      }
      curr.setDate(curr.getDate() + 1);
    }
    const fallback = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 45, 12, 0, 0);
    return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}`;
  }, [barberWorkingDayNumbers]);

  // Validador unificado de disponibilidad de fechas (utilizado tanto por el calendario como por la tira rápida)
  const isDateAvailable = useCallback(
    (dateStr: string): {
      available: boolean;
      reason?: string;
      isPast: boolean;
      isRestDay: boolean;
      isFrequencyRestricted: boolean;
      nextAllowedDate?: string;
    } => {
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const isPast = dateStr < todayKey;
      if (isPast) {
        return { available: false, reason: 'Día pasado', isPast: true, isRestDay: false, isFrequencyRestricted: false };
      }

      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d, 12, 0, 0);
      const dayOfWeek = dateObj.getDay();

      // Prioridad estricta de Días de Descanso sobre Excepciones de Horario:
      // Validar PRIMERO si el día de la semana está activo en "Días Laborales".
      if (!barberWorkingDayNumbers.includes(dayOfWeek)) {
        return { available: false, reason: 'Día de descanso del barbero', isPast: false, isRestDay: true, isFrequencyRestricted: false };
      }

      const wh = currentBarber?.workingHours || (currentBarber as any)?.working_hours || {};
      const specialList: any[] = [
        ...(Array.isArray(wh.specialDaySchedules) ? wh.specialDaySchedules : []),
        ...(Array.isArray((currentBarber?.schedule as any)?.exceptions) ? (currentBarber?.schedule as any).exceptions : []),
        ...(Array.isArray((currentBarber?.schedule as any)?.special_hours) ? (currentBarber?.schedule as any).special_hours : []),
      ];
      const specialForDate: any =
        specialList.find((s: any) => s && s.date === dateStr) ||
        specialList.find((s: any) => s && !s.date && Number(s.dayOfWeek) === dayOfWeek);
      const isSpecialClosed = Boolean(
        specialForDate && (
          specialForDate.isClosed ||
          specialForDate.isRestDay ||
          specialForDate.start === specialForDate.end ||
          specialForDate.label === 'Día de Descanso'
        )
      );

      if (isSpecialClosed) {
        return { available: false, reason: 'Día de descanso del barbero', isPast: false, isRestDay: true, isFrequencyRestricted: false };
      }

      const isBeyond31WorkingDays = dateStr > maxWorkingDayDateStr;
      if (isBeyond31WorkingDays) {
        return { available: false, reason: 'Fuera del rango (máximo 31 días hábiles)', isPast: false, isRestDay: false, isFrequencyRestricted: false };
      }

      const isFrequencyRestricted = frequencyRestrictions.restrictedDates.has(dateStr);
      const nextAllowedDate = frequencyRestrictions.earliestAllowedDateByDate.get(dateStr);
      if (isFrequencyRestricted) {
        return {
          available: false,
          reason: nextAllowedDate ? `Próximo turno disponible a partir del ${formatDateLabel(nextAllowedDate)}` : 'Restricción de frecuencia',
          isPast: false,
          isRestDay: false,
          isFrequencyRestricted: true,
          nextAllowedDate,
        };
      }

      return { available: true, isPast: false, isRestDay: false, isFrequencyRestricted: false };
    },
    [barberWorkingDayNumbers, maxWorkingDayDateStr, frequencyRestrictions, currentBarber]
  );

  // Requisito 3: Tira de botones rápidos generada dinámicamente iterando desde hoy con isDateAvailable
  // Detiene la iteración cuando encuentra exactamente los siguientes 6 días hábiles y elegibles
  const quickDays = useMemo(() => {
    const days: { date: string; dayName: string; label: string; isToday: boolean }[] = [];
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let curr = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    // Búsqueda en una ventana de hasta 90 días naturales
    for (let i = 0; i < 90 && days.length < 6; i++) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const check = isDateAvailable(dateStr);
      if (check.available) {
        days.push({
          date: dateStr,
          dayName: dateStr === todayStr ? 'Hoy' : getDayName(dateStr),
          label: formatDateLabel(dateStr),
          isToday: dateStr === todayStr,
        });
      }

      curr.setDate(curr.getDate() + 1);
    }

    return days;
  }, [isDateAvailable]);

  const [selectedDate, setSelectedDate] = useState<string>(() => quickDays[0]?.date || '');
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Sincronizar selectedDate si la fecha actual está inhabilitada o cambia la tira
  useEffect(() => {
    if (quickDays.length > 0) {
      const isCurrentValid = selectedDate && isDateAvailable(selectedDate).available;
      if (!isCurrentValid) {
        setSelectedDate(quickDays[0].date);
        setSelectedTime(null);
      }
    }
  }, [quickDays, selectedDate, isDateAvailable]);

  // Selector interactivo de calendario (hasta 31 días hábiles)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonthOffset, setCalendarMonthOffset] = useState<number>(0);

  // Si el usuario elige una fecha más allá de los primeros 6 días mediante el calendario, mostrarla activa en la tira
  const displayedDays = useMemo(() => {
    const formattedQuick = quickDays.map((d) => {
      const isRestricted = frequencyRestrictions.restrictedDates.has(d.date);
      const nextDate = frequencyRestrictions.earliestAllowedDateByDate.get(d.date);
      return {
        ...d,
        isBeyond: false,
        isRestrictedByFrequency: isRestricted,
        nextAllowedDate: nextDate,
      };
    });
    const isInsideQuick = formattedQuick.some((d) => d.date === selectedDate);
    if (isInsideQuick || !selectedDate) {
      return formattedQuick;
    }
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const isRestricted = frequencyRestrictions.restrictedDates.has(selectedDate);
    const nextDate = frequencyRestrictions.earliestAllowedDateByDate.get(selectedDate);
    const customCard = {
      date: selectedDate,
      dayName: dayNames[dt.getDay()],
      label: `${dt.getDate()} ${monthNames[dt.getMonth()]}`,
      isToday: false,
      isBeyond: true,
      isRestrictedByFrequency: isRestricted,
      nextAllowedDate: nextDate,
    };
    return [...formattedQuick, customCard];
  }, [quickDays, selectedDate, frequencyRestrictions]);

  const maxMonthOffset = useMemo(() => {
    const today = new Date();
    const [my, mm] = maxWorkingDayDateStr.split('-').map(Number);
    return Math.max(1, (my - today.getFullYear()) * 12 + (mm - 1 - today.getMonth()));
  }, [maxWorkingDayDateStr]);

  const displayedCalendarMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + calendarMonthOffset, 1);
  }, [calendarMonthOffset]);

  const MONTH_NAMES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  const DAY_HEADERS_ES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

  const calendarDays = useMemo(() => {
    const year = displayedCalendarMonth.getFullYear();
    const month = displayedCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();

    let startDayIndex = firstDay.getDay() - 1;
    if (startDayIndex === -1) startDayIndex = 6;

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const cells: Array<{
      dateStr: string;
      dayNum: number;
      isDisabled: boolean;
      isSelected: boolean;
      isToday: boolean;
      isRestDay: boolean;
      reason?: string;
    } | null> = [];

    for (let i = 0; i < startDayIndex; i++) {
      cells.push(null);
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const status = isDateAvailable(dateStr);

      cells.push({
        dateStr,
        dayNum: d,
        isDisabled: !status.available,
        isSelected: dateStr === selectedDate,
        isToday: dateStr === todayKey,
        isRestDay: status.isRestDay,
        reason: status.reason,
      });
    }

    return cells;
  }, [displayedCalendarMonth, isDateAvailable, selectedDate]);

  // Regla 4: Campos de cliente precargados pero 100% editables
  const [clientName, setClientName] = useState<string>(() => currentUser?.name || '');
  const [clientPhone, setClientPhone] = useState<string>(() => {
    const lastClient = storageService.getLastClient();
    const raw =
      currentUser?.phone ||
      (currentUser as any)?.user_metadata?.phone ||
      (currentUser as any)?.user_metadata?.phoneNumber ||
      (currentUser as any)?.user_metadata?.celular ||
      lastClient?.phone ||
      '';
    if (raw && raw.trim() && raw.trim() !== '+57') {
      return raw.startsWith('+') ? raw : `+57${raw}`;
    }
    return '+57';
  });
  const [clientEmail, setClientEmail] = useState<string>(() => currentUser?.email || '');
  const [clientNotes, setClientNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sincronizar datos si currentUser o sus metadata se actualizan
  React.useEffect(() => {
    if (currentUser) {
      if (currentUser.name && !clientName) setClientName(currentUser.name);
      if (currentUser.email && !clientEmail) setClientEmail(currentUser.email);
      const lastClient = storageService.getLastClient();
      const raw =
        currentUser.phone ||
        (currentUser as any)?.user_metadata?.phone ||
        (currentUser as any)?.user_metadata?.phoneNumber ||
        (currentUser as any)?.user_metadata?.celular ||
        lastClient?.phone;
      if (raw && raw.trim() && (!clientPhone || clientPhone === '+57')) {
        const p = raw.startsWith('+') ? raw : `+57${raw}`;
        setClientPhone(p);
      }
    }
  }, [currentUser]);

  // Consultar metadata de usuario en Supabase si el teléfono aún no está precargado
  React.useEffect(() => {
    async function fetchMetadataPhone() {
      if (!currentUser) return;
      try {
        const { data } = await supabase.auth.getUser();
        const metaPhone =
          data?.user?.user_metadata?.phone ||
          data?.user?.phone ||
          data?.user?.user_metadata?.phoneNumber ||
          data?.user?.user_metadata?.celular;
        if (metaPhone && metaPhone.trim() && (!clientPhone || clientPhone === '+57')) {
          const formatted = metaPhone.startsWith('+') ? metaPhone : `+57${metaPhone}`;
          setClientPhone(formatted);
          return;
        }

        // Consultar tabla de perfiles en Supabase si existe
        try {
          const { data: prof } = await supabase
            .from('profiles')
            .select('phone')
            .eq('id', currentUser.id)
            .maybeSingle();
          if (prof?.phone && prof.phone.trim() && (!clientPhone || clientPhone === '+57')) {
            const formatted = prof.phone.startsWith('+') ? prof.phone : `+57${prof.phone}`;
            setClientPhone(formatted);
          }
        } catch {
          // ignore
        }
      } catch (e) {
        // Fallback silencioso
      }
    }
    fetchMetadataPhone();
  }, [currentUser]);

  // Calculate real-time slots strictly bounded by working_hours (open and close times)
  const availableSlots: TimeSlotStatus[] = useMemo(() => {
    if (!currentBarber || !selectedDate) return [];
    const [yy, mm, dd] = selectedDate.split('-').map(Number);
    const dayOfWeek = new Date(yy, mm - 1, dd, 12, 0, 0).getDay();

    // Validar PRIMERO si el día de la semana está activo en "Días Laborales"
    if (!barberWorkingDayNumbers.includes(dayOfWeek)) {
      return [];
    }

    const rawSlots = generateDailySlots(currentBarber, selectedDate, effectiveAppointments, blockedSlots);

    // Validación global estricta con working_hours (hora de apertura y cierre configuradas)
    const wh = currentBarber.workingHours || (currentBarber as any).working_hours || {};
    const specialList: any[] = [
      ...(Array.isArray(wh.specialDaySchedules) ? wh.specialDaySchedules : []),
      ...(Array.isArray((currentBarber.schedule as any)?.exceptions) ? (currentBarber.schedule as any).exceptions : []),
      ...(Array.isArray((currentBarber.schedule as any)?.special_hours) ? (currentBarber.schedule as any).special_hours : []),
    ];
    const specialForDate =
      specialList.find((s) => s && s.date === selectedDate) ||
      specialList.find((s) => s && !s.date && Number(s.dayOfWeek) === dayOfWeek);

    const open24 = normalizeTimeTo24h(
      specialForDate?.start || wh.start || currentBarber.openTime || (currentBarber.schedule as any)?.openTime || '09:00',
      '09:00'
    );
    const close24 = normalizeTimeTo24h(
      specialForDate?.end || wh.end || currentBarber.closeTime || (currentBarber.schedule as any)?.closeTime || '20:00',
      '20:00'
    );
    const [oh, om] = open24.split(':').map(Number);
    const [ch, cm] = close24.split(':').map(Number);
    const openMins = (oh || 0) * 60 + (om || 0);
    const closeMins = (ch || 0) * 60 + (cm || 0);
    const slotDuration = Number(wh.slotDurationMinutes || 30);

    return rawSlots.filter((slot) => {
      const slot24 = normalizeTimeTo24h(slot.time, slot.time);
      const [sh, sm] = slot24.split(':').map(Number);
      const slotMins = (sh || 0) * 60 + (sm || 0);
      // Ninguna hora fuera del rango [openMins, closeMins - slotDuration] puede mostrarse como disponible en la reserva pública
      if (slotMins < openMins || slotMins + slotDuration > closeMins) {
        return false;
      }
      return true;
    });
  }, [currentBarber, selectedDate, effectiveAppointments, blockedSlots, barberWorkingDayNumbers]);

  // Reset selected time if it becomes booked/unavailable in real time
  React.useEffect(() => {
    if (selectedTime) {
      const match = availableSlots.find((s) => s.time === selectedTime);
      if (!match || match.status !== 'available') {
        setSelectedTime(null);
      }
    }
  }, [availableSlots, selectedTime]);

  // Regla 3: Franjas horarias estrictas de 30 minutos
  // Turno Mañana: Desde apertura hasta las 11:30 AM inclusive (< 720 mins / 12:00 PM)
  const morningSlots = useMemo(() => {
    return availableSlots.filter((s) => {
      const [h, m] = s.time.split(':').map(Number);
      return h * 60 + m < 720;
    });
  }, [availableSlots]);

  // Turno Tarde: Desde las 12:00 PM hasta las 5:30 PM inclusive (>= 720 mins y < 1080 mins / 18:00)
  const afternoonSlots = useMemo(() => {
    return availableSlots.filter((s) => {
      const [h, m] = s.time.split(':').map(Number);
      const mins = h * 60 + m;
      return mins >= 720 && mins < 1080;
    });
  }, [availableSlots]);

  // Turno Noche: Desde las 6:00 PM en adelante (>= 1080 mins / 18:00)
  const eveningSlots = useMemo(() => {
    return availableSlots.filter((s) => {
      const [h, m] = s.time.split(':').map(Number);
      return h * 60 + m >= 1080;
    });
  }, [availableSlots]);

  const availableCount = useMemo(
    () => availableSlots.filter((s) => s.status === 'available').length,
    [availableSlots]
  );

  // Active upcoming appointments for the authenticated user (unificado por ID y Email insensible a mayúsculas)
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null);
  const [cancelErrorMsg, setCancelErrorMsg] = useState<string | null>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState<boolean>(false);

  const activeUpcomingAppointments = useMemo(() => {
    if (!currentUser) return [];

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const cleanId = (currentUser.id || '').trim();
    const cleanEmail = (currentUser.email || '').trim().toLowerCase();
    const cleanPhone = (currentUser.phone || '').trim();

    return effectiveAppointments
      .filter((apt) => {
        const aptId = (apt.clientId || (apt as any).client_id || '').trim();
        const aptEmail = (apt.clientEmail || (apt as any).client_email || '').trim().toLowerCase();
        const aptPhone = (apt.clientPhone || (apt as any).client_phone || '').trim();

        const isClientAppointment =
          Boolean(cleanId && aptId && aptId === cleanId) ||
          Boolean(cleanEmail && aptEmail && aptEmail === cleanEmail) ||
          Boolean(cleanPhone && aptPhone && aptPhone === cleanPhone);

        const isActiveStatus = apt.status === 'confirmed' || apt.status === 'in_progress' || (apt.status as string) === 'pending';
        if (!isClientAppointment || !isActiveStatus) return false;

        // Check if date and time are future or current
        if (apt.date > todayStr) return true;
        if (apt.date < todayStr) return false;

        // Today: allow up to 30 min into the slot before considering it passed
        try {
          const [hours, mins] = apt.time.split(':').map(Number);
          const aptDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, mins + 30);
          return aptDateObj.getTime() >= now.getTime();
        } catch {
          return true;
        }
      })
      .sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return a.time.localeCompare(b.time);
      });
  }, [effectiveAppointments, currentUser]);

  // Regla 6: Comprobación reactiva si ya tiene cita para la fecha seleccionada (sincronizada estrictamente con citas activas)
  const userAlreadyBookedOnSelectedDate = useMemo(() => {
    if (!currentUser || !selectedDate || activeUpcomingAppointments.length === 0) return false;
    return activeUpcomingAppointments.some((a) => a.date === selectedDate);
  }, [currentUser, selectedDate, activeUpcomingAppointments]);

  // Limitación máxima de 3 reservas activas por cliente
  const hasReachedActiveBookingLimit = useMemo(() => {
    if (!currentUser) return false;
    return activeUpcomingAppointments.length >= 3;
  }, [currentUser, activeUpcomingAppointments]);

  // 1. Filtrado Estricto de Citas Pendientes de Calificación
  const [pendingRatings, setPendingRatings] = useState<Appointment[]>([]);
  const [handledRatingIds, setHandledRatingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!currentUser) {
      setPendingRatings([]);
      return;
    }
    const reviewedIds = storageService.getReviewedAppointmentIds();
    const dismissedIds = storageService.getDismissedReviewIds();
    const cleanId = (currentUser.id || '').trim();
    const cleanEmail = (currentUser.email || '').trim().toLowerCase();

    const filtered = effectiveAppointments.filter((apt) => {
      const aptId = (apt.clientId || (apt as any).client_id || '').trim();
      const aptEmail = (apt.clientEmail || (apt as any).client_email || '').trim().toLowerCase();

      const isClientAppointment =
        Boolean(cleanId && aptId && aptId === cleanId) ||
        Boolean(cleanEmail && aptEmail && aptEmail === cleanEmail);

      if (!isClientAppointment) return false;

      // Condición obligatoria: apt.status === "completed" && !apt.rated && !apt.rating_dismissed
      if (!(apt.status === 'completed' && !apt.rated && !apt.rating_dismissed)) {
        return false;
      }

      if ((apt as any).rating || (apt as any).reviewCompleted || (apt as any).ratingDismissed) {
        return false;
      }

      return !reviewedIds.has(apt.id) && !dismissedIds.has(apt.id) && !handledRatingIds.has(apt.id);
    });

    setPendingRatings(filtered);
  }, [effectiveAppointments, currentUser, handledRatingIds]);

  const [selectedRatingByApt, setSelectedRatingByApt] = useState<Record<string, number>>({});
  const [isSubmittingRating, setIsSubmittingRating] = useState<Record<string, boolean>>({});
  const [ratingSuccessMsg, setRatingSuccessMsg] = useState<string | null>(null);

  // 2. Persistencia Inmediata al Presionar "Calificar servicio"
  const handleSubmitRating = async (apt: Appointment) => {
    const appointmentId = apt.id;
    const selectedRating = selectedRatingByApt[appointmentId] || 5;
    const commentText = '';
    setIsSubmittingRating((prev) => ({ ...prev, [appointmentId]: true }));

    // b) Remover la cita del estado local en ese mismo instante para que desaparezca visualmente de inmediato
    setPendingRatings((prev) => prev.filter((item) => item.id !== appointmentId));
    setHandledRatingIds((prev) => {
      const next = new Set(prev);
      next.add(appointmentId);
      return next;
    });
    setLocalApts((prev) =>
      prev.map((item) =>
        item.id === appointmentId
          ? { ...item, rated: true, rating: selectedRating, review: commentText }
          : item
      )
    );

    try {
      // a) Actualizar inmediatamente la fila en Supabase ('public.appointments')
      await supabase
        .from('appointments')
        .update({ rated: true, rating: selectedRating, review: commentText })
        .eq('id', appointmentId);

      await storageService.submitBarberRating(apt.barberId, selectedRating, appointmentId, commentText);
      setRatingSuccessMsg(`¡Gracias por calificar a ${apt.barberName} con ${selectedRating} estrellas!`);
      setTimeout(() => setRatingSuccessMsg(null), 5000);
      if (onRefreshData) onRefreshData();
    } catch (e) {
      console.warn('Error submitting rating:', e);
    } finally {
      setIsSubmittingRating((prev) => ({ ...prev, [appointmentId]: false }));
    }
  };

  // 3. Descarte Permanente con "Cerrar sin calificar"
  const handleDismissRating = async (appointmentId: string) => {
    // b) Remover la tarjeta del estado local de inmediato
    setPendingRatings((prev) => prev.filter((item) => item.id !== appointmentId));
    setHandledRatingIds((prev) => {
      const next = new Set(prev);
      next.add(appointmentId);
      return next;
    });
    setLocalApts((prev) =>
      prev.map((item) =>
        item.id === appointmentId ? { ...item, rating_dismissed: true } : item
      )
    );

    try {
      // a) Actualizar la cita en Supabase marcándola como descartada
      await supabase
        .from('appointments')
        .update({ rating_dismissed: true })
        .eq('id', appointmentId);

      await storageService.dismissAppointmentReview(appointmentId);
      if (onRefreshData) onRefreshData();
    } catch (e) {
      console.warn('Error dismissing rating:', e);
    }
  };

  // Fechas con reservas activas del usuario para marcar visualmente en el carrusel de días
  const userBookedDates = useMemo(() => {
    if (!currentUser || activeUpcomingAppointments.length === 0) return new Set<string>();
    const dates = new Set<string>();
    activeUpcomingAppointments.forEach((a) => {
      dates.add(a.date);
    });
    return dates;
  }, [currentUser, activeUpcomingAppointments]);

  const handleCancelAppointment = async (apt: Appointment) => {
    const cancelRule = isAppointmentCancellableByClient(apt.date, apt.time);
    if (!cancelRule.canCancel) {
      setCancelErrorMsg(cancelRule.reason || 'Las cancelaciones solo están permitidas hasta 1 hora antes del turno.');
      setConfirmCancelId(null);
      return;
    }

    try {
      setCancellingId(apt.id);
      setCancelErrorMsg(null);
      setConfirmCancelId(null);

      // Punto 4: Desaparición instantánea en 0ms del estado local sin recargar la página
      setCancelledIds((prev) => {
        const next = new Set(prev);
        next.add(apt.id);
        return next;
      });
      setLocalApts((prev) => prev.filter((a) => a.id !== apt.id));
      setLastCancelledApt(apt);

      setCancelSuccessMsg(
        `Tu cita con ${apt.barberName} para el ${formatDateLabel(apt.date)} a las ${formatTimeTo12h(apt.time)} ha sido cancelada exitosamente.`
      );

      // Persistir cancelación en Supabase y caché local
      await storageService.cancelAppointment(apt.id, 'client');
      realtimeService.emit({
        type: 'CANCEL_BOOKING',
        actor: currentUser?.role || 'client',
        payload: { appointmentId: apt.id },
        message: 'Turno cancelado',
      });

      if (onRefreshData) onRefreshData();
      setTimeout(() => {
        setCancelSuccessMsg((prev) => (prev ? null : prev));
        setLastCancelledApt((prev) => (prev?.id === apt.id ? null : prev));
      }, 7000);
    } catch (err: any) {
      setCancelErrorMsg(err?.message || 'Error al cancelar la cita. Inténtalo de nuevo.');
    } finally {
      setCancellingId(null);
    }
  };

  const handleUndoCancelAppointment = async () => {
    if (!lastCancelledApt) return;
    const aptToRestore = { ...lastCancelledApt, status: 'confirmed' as const };
    setLastCancelledApt(null);
    setCancelSuccessMsg(null);

    setCancelledIds((prev) => {
      const next = new Set(prev);
      next.delete(aptToRestore.id);
      return next;
    });
    setLocalApts((prev) => [aptToRestore, ...prev.filter((a) => a.id !== aptToRestore.id)]);

    try {
      await storageService.updateAppointmentStatus(aptToRestore.id, 'confirmed');
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.warn('Error restaurando cita:', err);
    }
  };

  // Handle Booking Submit
  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validar selección de barbero y servicio
    if (!currentBarber) {
      setFormError('Por favor busca y selecciona un barbero en el Paso 1.');
      return;
    }
    if (!currentService) {
      setFormError('Por favor selecciona un servicio en el Paso 2.');
      return;
    }
    if (!selectedTime) {
      setFormError('Por favor selecciona un horario disponible.');
      return;
    }

    // STRICT AUTH VERIFICATION: Must have an active user ID
    if (!currentUser || !currentUser.id) {
      setFormError('Debes iniciar sesión con una cuenta válida para agendar un turno.');
      onOpenAuthModal();
      return;
    }

    // Limitación máxima de 3 reservas activas por cliente
    if (hasReachedActiveBookingLimit) {
      setFormError(
        'Has alcanzado el límite máximo de 3 citas activas. Para programar un nuevo turno, debes completar o cancelar una de tus reservas actuales.'
      );
      return;
    }

    // Restricción de 6 días: Inhabilita los 6 días posteriores a una cita previa del cliente
    if (frequencyRestrictions.restrictedDates.has(selectedDate)) {
      const nextAllowed =
        frequencyRestrictions.earliestAllowedDateByDate.get(selectedDate) ||
        frequencyRestrictions.latestNextAllowedDate;
      setFormError(
        `Para mantener tu estilo y optimizar la agenda, tu próximo turno disponible es a partir del ${nextAllowed ? formatDateLabel(nextAllowed) : 'la fecha habilitada'}.`
      );
      return;
    }

    if (!clientName.trim()) {
      setFormError('Por favor ingresa tu nombre completo.');
      return;
    }

    // El campo 'Email *' es obligatorio y siempre guarda el correo inmutable de la sesión autenticada
    const finalClientEmail = (currentUser?.email || clientEmail || '').trim().toLowerCase();
    if (!finalClientEmail) {
      setFormError('El correo electrónico es obligatorio para confirmar la reserva.');
      return;
    }

    // El campo 'WhatsApp / Celular' pasa a ser opcional (sin asterisco)
    let finalClientPhone = clientPhone.trim();
    if (finalClientPhone && finalClientPhone !== '+57') {
      const phoneCheck = validatePhoneDigits(finalClientPhone);
      if (!phoneCheck.isValid) {
        setFormError(phoneCheck.message || 'El número de WhatsApp/celular ingresado no es válido.');
        return;
      }
    } else {
      finalClientPhone = '';
    }

    // Bloqueo silencioso de cliente por barbero
    if (currentBarber?.id && finalClientEmail) {
      const isBlocked = storageService.isClientBlockedByBarber(currentBarber.id, finalClientEmail);
      if (isBlocked) {
        setFormError('Lo sentimos, este horario no se encuentra disponible. Por favor selecciona otro barbero o fecha.');
        return;
      }
    }

    setIsSubmitting(true);

    // REGLA 6: Consulta estricta de 1 cita diaria por cliente para la misma fecha
    const currentApts = storageService.getCachedAppointments();
    const alreadyBookedLocal = currentApts.some(
      (a) =>
        (a.clientId === currentUser.id ||
          (Boolean(currentUser.email) && a.clientEmail?.toLowerCase() === currentUser.email?.toLowerCase())) &&
        a.date === selectedDate &&
        (a.status === 'confirmed' || a.status === 'in_progress' || (a.status as string) === 'pending')
    );

    let alreadyBookedCloud = false;
    try {
      const { data: cloudApts, error: cloudErr } = await supabase
        .from('appointments')
        .select('id, code, type, status, client_id, date, price, service_price')
        .eq('client_id', currentUser.id)
        .eq('date', selectedDate);

      if (!cloudErr && cloudApts) {
        alreadyBookedCloud = cloudApts.some(
          (a) => a.status === 'confirmed' || a.status === 'in_progress' || a.status === 'pending'
        );
      }
    } catch (err) {
      console.warn('Error checking existing appointment in Supabase:', err);
    }

    if (alreadyBookedLocal || alreadyBookedCloud) {
      setFormError(
        'Ya tienes una cita reservada para este día. Si necesitas una cita doble o un horario adicional en la misma fecha, por favor contacta directamente al barbero para que la separe manualmente.'
      );
      setIsSubmitting(false);
      return;
    }

    // Double-check real-time availability in storage
    const isTaken = currentApts.some(
      (a) =>
        a.barberId === currentBarber.id &&
        a.date === selectedDate &&
        a.time === selectedTime &&
        a.status !== 'cancelled'
    );

    if (isTaken) {
      setFormError('Lo sentimos, este turno acaba de ser reservado por otro usuario. Por favor selecciona otro horario.');
      setSelectedTime(null);
      setIsSubmitting(false);
      return;
    }

    const bookingCode = generateNextBookingCode('CO');
    const clientId = currentUser.id;
    const finalClientName = clientName.trim() || currentUser.name || '';

    const normalizedTime = normalizeTime(selectedTime || '');
    const appointmentId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `apt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const newAppointment: Appointment = {
      id: appointmentId,
      code: bookingCode,
      clientId,
      client_id: clientId,
      barberId: currentBarber.id,
      barber_id: currentBarber.id,
      barberEmail: currentBarber.email,
      barber_email: currentBarber.email,
      barberName: currentBarber.name,
      barber_name: currentBarber.name,
      serviceId: currentService.id,
      service_id: currentService.id,
      serviceName: currentService.name,
      service_name: currentService.name,
      servicePrice: currentService.price,
      service_price: currentService.price,
      price: currentService.price,
      serviceDuration: 30, // Regla 5: Duración fija estándar de 30 minutos
      duration_minutes: 30,
      date: selectedDate,
      appointment_date: selectedDate,
      time: normalizedTime,
      appointment_time: normalizedTime,
      clientName: finalClientName,
      client_name: finalClientName,
      clientPhone: finalClientPhone,
      client_phone: finalClientPhone,
      clientEmail: finalClientEmail,
      client_email: finalClientEmail,
      clientNotes: clientNotes.trim() || undefined,
      client_notes: clientNotes.trim() || undefined,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
      source: 'online',
      type: 'virtual',
    };

    // 1. Guardar en estado local y ejecutar inserción obligatoria en la tabla 'appointments' de Supabase
    try {
      const guaranteedApt = await storageService.addAppointment(newAppointment, currentUser);
      setLocalApts((prev) => storageService.mergeAppointments(prev, [guaranteedApt]));

      // 2. Recargar de inmediato citas desde Supabase para que aparezca al instante en Citas Activas
      await loadAppointments();

      // 3. Emitir evento en tiempo real
      storageService.broadcastAppointmentEvent('NEW_BOOKING', guaranteedApt);

      realtimeService.emit({
        type: 'NEW_BOOKING',
        actor: 'client',
        payload: guaranteedApt,
        message: 'Turno reservado con éxito',
      });

      if (onRefreshData) {
        onRefreshData();
      }

      // 4. Refrescar y limpiar todos los campos del formulario de reserva y scroll suave hacia arriba
      setSelectedBarberId('');
      setSelectedServiceId('');
      setSelectedTime(null);
      setClientNotes('');
      setClientPhone('');
      setIsSubmitting(false);

      window.scrollTo({ top: 0, behavior: 'smooth' });

      onBookingComplete(guaranteedApt);
    } catch (err: any) {
      console.warn('Conflicto o error al reservar turno:', err);
      // Alerta amigable en pantalla y refresco forzado
      setFormError('Este turno acaba de ser tomado por otra persona. Por favor, recarga o elige otro.');
      setSelectedTime(null);
      await loadAppointments();
      if (onRefreshData) {
        onRefreshData();
      }
      setIsSubmitting(false);
    }
  };

  if (loading && (barbers.length === 0 || services.length === 0)) {
    return (
      <div className="py-20 text-center text-slate-400">
        <div className="w-8 h-8 mx-auto border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-300">Cargando barberos y disponibilidad...</p>
      </div>
    );
  }

  // Helper to render individual barber card (100% idéntica a ProfilePreviewModal y BarberPublicCard)
  const renderBarberCard = (barber: Barber, isHabitualBadge: boolean = false) => {
    const isSelected = barber.id === selectedBarberId;
    return (
      <div key={barber.id} className="w-full">
        <BarberOfficialCardView
          barber={barber}
          services={services}
          isSelected={isSelected}
          isHabitualBadge={isHabitualBadge}
          onSelect={() => {
            setSelectedBarberId(barber.id);
            setSelectedTime(null);
            setTimeout(() => {
              document.getElementById('step-service')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
          }}
        />
      </div>
    );
  };

  return (
    <div className="space-y-10">
      {/* Hero Banner Section */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-[#141822] to-slate-900 border border-slate-800 p-6 sm:p-8">
        <div className="w-full">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-400 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>RESERVA DE CITAS</span>
            <span className="text-slate-600">·</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Disponibilidad en tiempo real
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight w-full">
            Reserva de Citas
          </h1>
          <p className="text-sm sm:text-base text-slate-300 mt-2 leading-relaxed w-full">
            Elige tu profesional, el servicio deseado y asegura tu sillón al instante con confirmación garantizada por WhatsApp y calendario.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-2.5 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Actualización en vivo sin recargar la página</span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Turnos de 30 min de máxima atención</span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <Star className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Profesionales calificados y certificados</span>
          </div>
        </div>
      </section>

      {/* Notifications / Cancellation feedback */}
      {cancelSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{cancelSuccessMsg}</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {lastCancelledApt && (
              <button
                type="button"
                onClick={handleUndoCancelAppointment}
                className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-bold text-xs transition-colors cursor-pointer"
              >
                Deshacer
              </button>
            )}
            <button
              onClick={() => {
                setCancelSuccessMsg(null);
                setLastCancelledApt(null);
              }}
              className="text-slate-400 hover:text-white p-1 cursor-pointer"
              aria-label="Cerrar notificación"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {cancelErrorMsg && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{cancelErrorMsg}</span>
          </div>
          <button
            onClick={() => setCancelErrorMsg(null)}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Cerrar notificación"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SECCIÓN: Pendiente de Calificación para Citas Completadas */}
      {pendingRatings.length > 0 && (
        <section className="rounded-2xl border border-amber-500/50 bg-gradient-to-br from-[#181d2c] via-[#121624] to-[#151a2b] p-5 sm:p-6 shadow-xl shadow-amber-950/30 space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Pendiente de calificación
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/40 animate-pulse">
                  Tu opinión importa
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Tu cita ha sido completada. Califícanos para ayudar a mantener el estándar de calidad en BarberAdes.
              </p>
            </div>
          </div>

          {ratingSuccessMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{ratingSuccessMsg}</span>
            </div>
          )}

          <div className="space-y-3">
            {pendingRatings.map((apt) => {
              const currentStars = selectedRatingByApt[apt.id] || 5;
              const isSubmitting = isSubmittingRating[apt.id] || false;

              return (
                <div
                  key={apt.id}
                  className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{apt.serviceName}</span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Completada
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                      <span>Barbero: <strong className="text-slate-200">{apt.barberName}</strong></span>
                      <span>·</span>
                      <span>Fecha: <strong className="text-slate-200">{formatDateLabel(apt.date)} ({formatTimeTo12h(apt.time)})</strong></span>
                      <span>·</span>
                      <span className="font-mono text-amber-400 font-bold">{formatCurrency(Number((apt as any).price ?? (apt as any).service_price ?? apt.servicePrice ?? 0))}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {/* Estrellas 1 a 5 */}
                    <div className="flex items-center gap-1 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSelectedRatingByApt((prev) => ({ ...prev, [apt.id]: star }))}
                          className="p-1 text-slate-600 hover:text-amber-400 transition-colors cursor-pointer"
                          title={`${star} estrella${star > 1 ? 's' : ''}`}
                        >
                          <Star
                            className={`w-5 h-5 transition-transform hover:scale-110 ${
                              star <= currentStars
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-600'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-1 text-xs font-bold font-mono text-amber-400">
                        {currentStars}.0
                      </span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleSubmitRating(apt)}
                        className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer"
                      >
                        {isSubmitting ? 'Guardando...' : 'Calificar servicio'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDismissRating(apt.id)}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Cerrar sin calificar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SECCIÓN INTEGRADA: Tu Próxima Cita (Visible solo si hay citas activas futuras o actuales) */}
      {activeUpcomingAppointments.length > 0 ? (
        <section
          id="tu-proxima-cita"
          className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-[#121622] via-[#0f121a] to-[#141824] p-5 sm:p-6 shadow-xl shadow-amber-950/20 relative overflow-hidden animate-in fade-in duration-300 scroll-mt-24"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    {activeUpcomingAppointments.length === 1
                      ? 'Tu Próxima Cita'
                      : `Tus Citas Programadas (${activeUpcomingAppointments.length})`}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Activa
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tienes {activeUpcomingAppointments.length === 1 ? 'una reserva asegurada' : `${activeUpcomingAppointments.length} reservas aseguradas`} en BarberAdes.
                </p>
              </div>
            </div>

            {currentUser && (
              <span className="text-xs text-slate-400">
                Cliente: <strong className="text-slate-200">{currentUser.name}</strong>
              </span>
            )}
          </div>

          {/* List of active upcoming appointments with accordion optimization */}
          <div className="space-y-3 sm:space-y-4">
            {/* Cita más inmediata (siempre visible y destacada) */}
            {activeUpcomingAppointments.length > 0 && (() => {
              const apt = activeUpcomingAppointments[0];
              const barberObj = barbers.find((b) => b.id === apt.barberId);
              const isConfirming = confirmCancelId === apt.id;
              const isProcessing = cancellingId === apt.id;

              return (
                <div
                  key={apt.id}
                  className="bg-slate-900/90 border border-slate-800/90 hover:border-slate-700/80 rounded-xl p-4 sm:p-5 transition-all shadow-md"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Key Appointment Information */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 flex-1">
                      {/* Barber */}
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full bg-gradient-to-br ${
                            barberObj?.avatarColor || 'from-amber-600 to-amber-800'
                          } text-white font-bold text-sm flex items-center justify-center border border-amber-500/30 shrink-0 shadow-sm`}
                        >
                          {apt.barberName[0]}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                            Barbero
                          </span>
                          <span className="text-sm font-bold text-white truncate block">
                            {apt.barberName}
                          </span>
                        </div>
                      </div>

                      {/* Service - Sin truncamiento rígido para lectura completa */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                          <Scissors className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                            Servicio
                          </span>
                          <span className="text-sm font-semibold text-slate-200 block break-words">
                            {apt.serviceName}
                          </span>
                          <span className="text-xs text-amber-400 font-mono">
                            {formatCurrency(Number((apt as any).price ?? (apt as any).service_price ?? apt.servicePrice ?? 0))} · 30 min
                          </span>
                        </div>
                      </div>

                      {/* Date */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-300 shrink-0">
                          <Calendar className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                            Fecha
                          </span>
                          <span className="text-sm font-semibold text-slate-200 block capitalize">
                            {formatDateLabel(apt.date)}
                          </span>
                        </div>
                      </div>

                      {/* Time & Homogenized Booking Code */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-300 shrink-0">
                          <Clock className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                            Horario
                          </span>
                          <span className="text-sm font-bold text-amber-400 font-mono block">
                            {formatTimeTo12h(apt.time)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatBookingCode(apt.code, 'CO')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800 shrink-0">
                      {/* WhatsApp Link */}
                      <a
                        href={generateWhatsAppLink(
                          apt,
                          barbers.find((b) => b.id === apt.barberId)?.barbershopName ||
                            (apt as any).barbershopName ||
                            (apt as any).business_name
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors flex items-center gap-1.5"
                        title="Abrir confirmación en WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </a>

                      {/* Cancel Button */}
                      {(() => {
                        const cancelCheck = isAppointmentCancellableByClient(apt.date, apt.time);
                        if (!cancelCheck.canCancel) {
                          return (
                            <div className="relative group inline-block">
                              <button
                                type="button"
                                disabled
                                className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900/70 text-slate-500 border border-slate-800 cursor-not-allowed flex items-center gap-1.5 opacity-75"
                                title="Las cancelaciones solo están permitidas hasta 1 hora antes del turno"
                              >
                                <Lock className="w-3.5 h-3.5 text-slate-500" />
                                <span>No cancelable</span>
                              </button>
                              <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:block z-30 w-56 p-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-amber-300 shadow-xl pointer-events-none text-center">
                                Las cancelaciones solo están permitidas hasta 1 hora antes del turno.
                              </div>
                            </div>
                          );
                        }

                        if (isConfirming) {
                          return (
                            <div className="flex items-center gap-1.5 bg-rose-950/40 p-1 rounded-lg border border-rose-800/50">
                              <span className="text-[11px] text-rose-300 px-1 font-medium">¿Seguro?</span>
                              <button
                                type="button"
                                onClick={() => handleCancelAppointment(apt)}
                                disabled={isProcessing}
                                className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded transition-colors"
                              >
                                {isProcessing ? 'Cancelando...' : 'Sí, cancelar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmCancelId(null)}
                                disabled={isProcessing}
                                className="px-2 py-1 text-xs text-slate-300 hover:text-white rounded"
                              >
                                No
                              </button>
                            </div>
                          );
                        }

                        return (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelId(apt.id)}
                            className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/60 transition-colors flex items-center gap-1.5"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Cancelar Cita</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Citas adicionales colapsables en acordeón */}
            {activeUpcomingAppointments.length > 1 && (
              <div className="pt-1 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowAllUpcoming((prev) => !prev)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 text-xs font-semibold text-slate-300 hover:text-white transition-all flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {showAllUpcoming
                        ? 'Ocultar citas adicionales'
                        : `Ver ${activeUpcomingAppointments.length - 1} cita${
                            activeUpcomingAppointments.length - 1 > 1 ? 's' : ''
                          } más`}
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 group-hover:text-amber-400 transition-transform duration-200 ${
                      showAllUpcoming ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showAllUpcoming && (
                  <div className="space-y-3 sm:space-y-4 pt-1 animate-in fade-in duration-200">
                    {activeUpcomingAppointments.slice(1).map((apt) => {
                      const barberObj = barbers.find((b) => b.id === apt.barberId);
                      const isConfirming = confirmCancelId === apt.id;
                      const isProcessing = cancellingId === apt.id;

                      return (
                        <div
                          key={apt.id}
                          className="bg-slate-900/70 border border-slate-800/70 hover:border-slate-700/80 rounded-xl p-4 sm:p-5 transition-all"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            {/* Key Appointment Information */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 flex-1">
                              {/* Barber */}
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${
                                    barberObj?.avatarColor || 'from-amber-600 to-amber-800'
                                  } text-white font-bold text-sm flex items-center justify-center border border-amber-500/30 shrink-0 shadow-sm`}
                                >
                                  {apt.barberName[0]}
                                </div>
                                <div className="min-w-0">
                                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                                    Barbero
                                  </span>
                                  <span className="text-sm font-bold text-white truncate block">
                                    {apt.barberName}
                                  </span>
                                </div>
                              </div>

                              {/* Service - Sin truncamiento rígido */}
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                                  <Scissors className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                                    Servicio
                                  </span>
                                  <span className="text-sm font-semibold text-slate-200 block break-words">
                                    {apt.serviceName}
                                  </span>
                                  <span className="text-xs text-amber-400 font-mono">
                                    {formatCurrency(Number((apt as any).price ?? (apt as any).service_price ?? apt.servicePrice ?? 0))} · 30 min
                                  </span>
                                </div>
                              </div>

                              {/* Date */}
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-300 shrink-0">
                                  <Calendar className="w-4 h-4 text-amber-400" />
                                </div>
                                <div className="min-w-0">
                                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                                    Fecha
                                  </span>
                                  <span className="text-sm font-semibold text-slate-200 block capitalize">
                                    {formatDateLabel(apt.date)}
                                  </span>
                                </div>
                              </div>

                              {/* Time & Homogenized Booking Code */}
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-300 shrink-0">
                                  <Clock className="w-4 h-4 text-amber-400" />
                                </div>
                                <div className="min-w-0">
                                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                                    Horario
                                  </span>
                                  <span className="text-sm font-bold text-amber-400 font-mono block">
                                    {formatTimeTo12h(apt.time)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {formatBookingCode(apt.code, 'CO')}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800 shrink-0">
                              {/* WhatsApp Link */}
                              <a
                                href={generateWhatsAppLink(
                                  apt,
                                  barbers.find((b) => b.id === apt.barberId)?.barbershopName ||
                                    (apt as any).barbershopName ||
                                    (apt as any).business_name
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors flex items-center gap-1.5"
                                title="Abrir confirmación en WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="hidden sm:inline">WhatsApp</span>
                              </a>

                              {/* Cancel Button */}
                              {(() => {
                                const cancelCheck = isAppointmentCancellableByClient(apt.date, apt.time);
                                if (!cancelCheck.canCancel) {
                                  return (
                                    <div className="relative group inline-block">
                                      <button
                                        type="button"
                                        disabled
                                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900/70 text-slate-500 border border-slate-800 cursor-not-allowed flex items-center gap-1.5 opacity-75"
                                        title="Las cancelaciones solo están permitidas hasta 1 hora antes del turno"
                                      >
                                        <Lock className="w-3.5 h-3.5 text-slate-500" />
                                        <span>No cancelable</span>
                                      </button>
                                      <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:block z-30 w-56 p-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-amber-300 shadow-xl pointer-events-none text-center">
                                        Las cancelaciones solo están permitidas hasta 1 hora antes del turno.
                                      </div>
                                    </div>
                                  );
                                }

                                if (isConfirming) {
                                  return (
                                    <div className="flex items-center gap-1.5 bg-rose-950/40 p-1 rounded-lg border border-rose-800/50">
                                      <span className="text-[11px] text-rose-300 px-1 font-medium">¿Seguro?</span>
                                      <button
                                        type="button"
                                        onClick={() => handleCancelAppointment(apt)}
                                        disabled={isProcessing}
                                        className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded transition-colors"
                                      >
                                        {isProcessing ? 'Cancelando...' : 'Sí, cancelar'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmCancelId(null)}
                                        disabled={isProcessing}
                                        className="px-2 py-1 text-xs text-slate-300 hover:text-white rounded"
                                      >
                                        No
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmCancelId(apt.id)}
                                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/60 transition-colors flex items-center gap-1.5"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Cancelar Cita</span>
                                  </button>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        /* Estado despejado / mensaje discreto si no hay citas activas */
        <div className="py-2.5 px-4 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-400 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400/80 shrink-0" />
            <span>No tienes citas activas. Elige tu horario a continuación:</span>
          </div>
          {!currentUser && (
            <button
              onClick={onOpenAuthModal}
              className="text-amber-400 hover:text-amber-300 font-medium text-xs transition-colors shrink-0 underline underline-offset-2"
            >
              Iniciar sesión
            </button>
          )}
        </div>
      )}

      {/* STEP 1: Select Barber (Regla 1: Búsqueda limpia y proximidad) */}
      <section id="step-barber" className="space-y-4 scroll-mt-20 sm:scroll-mt-24">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">1. Elige a tu Barbero</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Encuentra tu barbero utilizando cualquier opción disponible.
            </p>
          </div>
          {currentBarber && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs text-amber-400 font-semibold flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                <Check className="w-3.5 h-3.5" />
                <span>Seleccionado: <strong>{currentBarber.name}</strong></span>
              </span>
            </div>
          )}
        </div>

        {/* Buscadores: En Vivo & Proximidad Maps */}
        <div className={`grid gap-3.5 ${barberSearchQuery.trim() ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
          {/* Búsqueda en vivo de Barberos */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-sm">
            <label className="block text-xs font-semibold text-slate-300">
              Buscar Barbero, Seudónimo o Barbería
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Ej. Marcos, El Maestro, Fade King..."
                value={barberSearchQuery}
                onChange={(e) => setBarberSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
              {barberSearchQuery && (
                <button
                  type="button"
                  onClick={() => setBarberSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Filtra por el barbero, seudónimo/especialidad o nombre de la barbería
            </p>
          </div>

          {/* Búsqueda por proximidad (Google Maps) - Se oculta temporalmente si el usuario escribe en el buscador */}
          {!barberSearchQuery.trim() && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-sm animate-in fade-in duration-200">
              <label className="block text-xs font-semibold text-slate-300">
                Buscar barberías cercanas con (Google Maps)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Dirección, barrio o ciudad (opcional)..."
                    value={proximityAddress}
                    onChange={(e) => setProximityAddress(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
                <a
                  href={
                    proximityAddress.trim()
                      ? `https://www.google.com/maps/search/barberias+cerca+de+${encodeURIComponent(proximityAddress.trim())}`
                      : 'https://www.google.com/maps/search/barberias+cerca+de+mi'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-md shadow-amber-950/30"
                  title="Abrir búsqueda en Google Maps"
                >
                  <span>Buscar en Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="text-[11px] text-slate-400">
                Recuerda ingresar una dirección o barrio; si dejas el campo en blanco, puede que no encuentres la barbería más cercana.
              </p>
            </div>
          )}
        </div>

        {/* Contenedor de barberos: Búsqueda activa vs Barbero seleccionado / habitual vs Estado limpio */}
        {barberSearchQuery.trim() ? (
          matchingBarbers.length === 0 ? (
            <div className="py-10 px-6 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80">
              <p className="text-sm font-semibold text-slate-300">
                No encontramos barberos que coincidan con "{barberSearchQuery}"
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Prueba con otro término, seudónimo o barbería (ej. Marcos, Mateo, Diego).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {matchingBarbers.map((barber) => renderBarberCard(barber, false))}
            </div>
          )
        ) : currentBarber ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {renderBarberCard(currentBarber, habitualBarber?.id === currentBarber.id)}
          </div>
        ) : habitualBarber ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {renderBarberCard(habitualBarber, true)}
          </div>
        ) : (
          <div className="py-10 px-6 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80">
            <div className="w-12 h-12 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-2.5">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">Búsqueda de Barberos</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Escribe en la barra superior el nombre de tu barbero, seudónimo (ej. "El Maestro", "Fade King") o barbería para ver los profesionales disponibles.
            </p>
          </div>
        )}
      </section>

      {/* STEP 2: Select Service (Regla 2: Catálogo dinámico por profesional) */}
      <section id="step-service" className="space-y-4 scroll-mt-20 sm:scroll-mt-24">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">2. Elige el Servicio</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {currentBarber
                ? `Catálogo exclusivo de ${currentBarber.name} (${currentBarber.barbershopName || 'BarberAdes'}).`
                : 'Selecciona primero un barbero en el Paso 1 para visualizar su catálogo.'}
            </p>
          </div>
          {currentBarber && (
            <span className="text-xs text-slate-400 tabular-nums">
              {filteredServices.length} servicios disponibles
            </span>
          )}
        </div>

        {!currentBarber ? (
          <div className="py-8 px-6 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400">
            <Scissors className="w-8 h-8 mx-auto text-amber-400/40 mb-2" />
            <p className="text-sm font-semibold text-slate-300">Selecciona a un barbero en el Paso 1</p>
            <p className="text-xs text-slate-500 mt-1">
              Los servicios, tarifas y tiempos oficiales se adaptan al profesional seleccionado.
            </p>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="py-8 px-6 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400">
            <p className="text-sm font-semibold text-slate-300">No hay servicios configurados para este barbero.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredServices.map((service) => {
              const isSelected = service.id === selectedServiceId;
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => {
                    setSelectedServiceId(service.id);
                    setTimeout(() => {
                      document.getElementById('step-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 50);
                  }}
                  className={`text-left p-4 rounded-xl border transition-all relative flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-900 border-amber-500/80 shadow-lg shadow-amber-950/20 ring-1 ring-amber-500/50'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-white text-sm pr-6">{service.name}</h3>
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : service.popular ? (
                        <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider shrink-0">
                          Popular
                        </span>
                      ) : null}
                    </div>

                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                      {service.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>30 min</span>
                    </div>
                    <div className="font-mono font-bold text-sm text-amber-400 tabular-nums">
                      {formatCurrency(service.price)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* STEP 3: Select Date & Real-time Slots (Regla 3: Franjas horarias estrictas de 30 min) */}
      <section id="step-schedule" className="space-y-4 scroll-mt-20 sm:scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">3. Fecha y Horarios Disponibles</h2>
            {currentBarber && (
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span className="font-semibold text-emerald-400 tabular-nums">{availableCount} disponibles</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">{currentBarber.name}</span>
              </p>
            )}
          </div>
        </div>

        {/* Regla 6: Alerta reactiva si ya tiene una cita activa para este día (sincronizada con citas activas vigentes) */}
        {activeUpcomingAppointments.length > 0 && userAlreadyBookedOnSelectedDate && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="block font-semibold text-amber-200">Reserva existente detectada:</strong>
              Ya tienes una cita reservada para este día. Si necesitas una cita doble o un horario adicional en la misma fecha, por favor contacta directamente al barbero para que la separe manualmente.
            </div>
          </div>
        )}

        {/* Restricción de 6 días: Advertencia informativa para fecha restringida (solo si hay cita activa) */}
        {activeUpcomingAppointments.length > 0 && frequencyRestrictions.restrictedDates.has(selectedDate) && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="block font-semibold text-amber-200 mb-0.5">
                Restricción de frecuencia (Máximo 1 corte cada 6 días):
              </strong>
              Para mantener tu estilo y optimizar la agenda, tu próximo turno disponible es a partir del{' '}
              <strong className="text-amber-200 font-bold underline underline-offset-2">
                {formatDateLabel(
                  frequencyRestrictions.earliestAllowedDateByDate.get(selectedDate) ||
                    frequencyRestrictions.latestNextAllowedDate ||
                    ''
                )}
              </strong>.
            </div>
          </div>
        )}

        {/* Limitación máxima de 3 reservas activas por cliente */}
        {hasReachedActiveBookingLimit && (
          <div className="p-4 sm:p-5 rounded-xl bg-rose-950/40 border border-rose-500/60 text-rose-300 text-xs sm:text-sm flex items-start gap-3 shadow-lg shadow-rose-950/20 animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="block font-bold text-rose-200 text-sm mb-1">
                Límite de Reservas Alcanzado
              </strong>
              <span>
                Has alcanzado el límite máximo de 3 citas activas. Para programar un nuevo turno, debes completar o cancelar una de tus reservas actuales.
              </span>
            </div>
          </div>
        )}

        {/* Controles de selección de Fecha y Horarios (Inhabilitados si se alcanza el límite de 3 reservas activas) */}
        <div className={`space-y-4 transition-all duration-200 ${hasReachedActiveBookingLimit ? 'opacity-40 pointer-events-none select-none cursor-not-allowed' : ''}`}>
          {/* Date Selector Carousel (6 días próximos) + Botón Elegir en Calendario alineado a la derecha */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none flex-1">
            {displayedDays.map((d) => {
              const isSelected = d.date === selectedDate;
              const hasBooking = userBookedDates.has(d.date);
              const isFrequencyRestricted = d.isRestrictedByFrequency;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => {
                    setSelectedDate(d.date);
                    setSelectedTime(null);
                  }}
                  className={`relative shrink-0 px-4 py-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 border-amber-500 text-slate-950 font-semibold shadow-md shadow-amber-950/30'
                      : isFrequencyRestricted
                      ? 'bg-slate-900/40 border-slate-800/60 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                      : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  {hasBooking ? (
                    <span
                      className={`absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full ${
                        isSelected
                          ? 'bg-slate-950 text-amber-400 border border-slate-900'
                          : 'bg-amber-500 text-slate-950 shadow-sm'
                      }`}
                      title="Ya tienes una reserva agendada en esta fecha"
                    >
                      <Lock className="w-2.5 h-2.5" />
                    </span>
                  ) : isFrequencyRestricted ? (
                    <span
                      className={`absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full ${
                        isSelected
                          ? 'bg-slate-950 text-amber-400 border border-slate-900'
                          : 'bg-amber-500/80 text-slate-950 shadow-sm'
                      }`}
                      title={`Restricción de frecuencia: Próximo turno disponible a partir del ${
                        d.nextAllowedDate ? formatDateLabel(d.nextAllowedDate) : ''
                      }`}
                    >
                      <Lock className="w-2.5 h-2.5" />
                    </span>
                  ) : null}
                  {d.isBeyond && (
                    <span
                      className={`absolute -top-1.5 -left-1 px-1.5 py-0.2 text-[9px] font-extrabold uppercase rounded-full ${
                        isSelected
                          ? 'bg-slate-950 text-amber-400 border border-slate-900'
                          : 'bg-amber-500 text-slate-950'
                      }`}
                    >
                      Calendario
                    </span>
                  )}
                  <div className="text-[11px] uppercase tracking-wider">{d.dayName}</div>
                  <div className="text-sm font-bold mt-0.5 whitespace-nowrap">{d.label}</div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            className={`shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
              isCalendarOpen
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-950/40'
                : 'bg-slate-900/90 text-amber-400 border-amber-500/30 hover:bg-slate-800 hover:border-amber-500/60'
            }`}
          >
            <Calendar className="w-4 h-4 text-current" />
            <span className="whitespace-nowrap">Elegir en calendario</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCalendarOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Modal / Popover del Calendario Minimalista Compacto Centrado */}
        {isCalendarOpen && (
          <div className="max-w-sm mx-auto p-4 rounded-xl border border-amber-500/30 bg-[#0a101f] shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
            {/* Cabecera limpia con botones '<' y '>' a los extremos y el mes centrado */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                disabled={calendarMonthOffset <= 0}
                onClick={() => setCalendarMonthOffset((prev) => Math.max(0, prev - 1))}
                className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:border-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition cursor-pointer"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-bold text-white tracking-wide capitalize">
                {MONTH_NAMES_ES[displayedCalendarMonth.getMonth()]} {displayedCalendarMonth.getFullYear()}
              </span>

              <button
                type="button"
                disabled={calendarMonthOffset >= maxMonthOffset}
                onClick={() => setCalendarMonthOffset((prev) => Math.min(maxMonthOffset, prev + 1))}
                className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:border-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed transition cursor-pointer"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Fila de días cortos con línea divisoria sutil debajo */}
            <div className="grid grid-cols-7 gap-1 text-center pb-2 border-b border-slate-800/80">
              {DAY_HEADERS_ES.map((h, i) => (
                <span key={i} className="text-[10px] font-semibold text-slate-400">
                  {h}
                </span>
              ))}
            </div>

            {/* Cuadrícula compacta de números sin bordes pesados en días inactivos */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarDays.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="h-7 w-full" />;
                }
                const { dateStr, dayNum, isDisabled, isSelected, isToday } = cell;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      setSelectedDate(dateStr);
                      setSelectedTime(null);
                      setIsCalendarOpen(false);
                    }}
                    className={`h-7 w-full rounded-lg text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                      isDisabled
                        ? 'text-slate-600 cursor-not-allowed bg-transparent'
                        : isSelected
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                        : isToday
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Slots Container */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-6">
          {!currentBarber ? (
            <div className="text-center py-8 text-slate-400">
              <Calendar className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-300">
                Selecciona a tu barbero en el Paso 1 para consultar su disponibilidad.
              </p>
            </div>
          ) : frequencyRestrictions.restrictedDates.has(selectedDate) ? (
            <div className="text-center py-8 text-amber-300 space-y-2">
              <Lock className="w-8 h-8 mx-auto text-amber-400" />
              <p className="text-sm font-semibold text-amber-200">
                Fecha no disponible por política de frecuencia (6 días)
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Para mantener tu estilo y optimizar la agenda, tu próximo turno disponible es a partir del{' '}
                <strong className="text-amber-300 font-bold underline underline-offset-2">
                  {formatDateLabel(
                    frequencyRestrictions.earliestAllowedDateByDate.get(selectedDate) ||
                      frequencyRestrictions.latestNextAllowedDate ||
                      ''
                  )}
                </strong>.
              </p>
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Calendar className="w-8 h-8 mx-auto text-amber-400 mb-2" />
              <p className="text-sm font-bold text-white">
                Día de Descanso Programado
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {currentBarber.name} no atiende en esta fecha. Por favor selecciona otro día en el selector superior.
              </p>
            </div>
          ) : (
            <>
              {/* Slot Legend */}
              <div className="flex items-center gap-4 text-xs text-slate-400 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-800 border border-amber-500/60" />
                  <span>Disponible (30 min)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-900/70 border border-slate-700/80 text-slate-400 opacity-80" />
                  <span>Ocupado / Reservado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/20 border border-amber-500/40" />
                  <span>Descanso / Bloqueado</span>
                </div>
              </div>

              {/* Turno Mañana: Desde apertura hasta las 11:30 AM */}
              {morningSlots.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2.5 flex items-center justify-between">
                    <span>Turno Mañana (Apertura - 11:30 AM)</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                    {morningSlots.map((slot) => renderSlotButton(slot))}
                  </div>
                </div>
              )}

              {/* Turno Tarde: Desde las 12:00 PM hasta las 5:30 PM */}
              {afternoonSlots.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2.5 flex items-center justify-between">
                    <span>Turno Tarde (12:00 PM - 5:30 PM)</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                    {afternoonSlots.map((slot) => renderSlotButton(slot))}
                  </div>
                </div>
              )}

              {/* Turno Noche: Desde las 6:00 PM en adelante */}
              {eveningSlots.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2.5 flex items-center justify-between">
                    <span>Turno Noche (6:00 PM - Cierre)</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                    {eveningSlots.map((slot) => renderSlotButton(slot))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>

      {/* STEP 4: Client Information & Booking Summary (Regla 4: Precarga 100% editable) */}
      <section id="step-confirmation" className="space-y-4 scroll-mt-20 sm:scroll-mt-24">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">4. Datos del Cliente & Confirmación</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Datos precargados de tu cuenta verificada. Puedes modificarlos libremente para esta reserva si lo deseas.
          </p>
        </div>

        <form onSubmit={handleBookingSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inputs */}
          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            {/* Verified Account Banner - Distribuido en 2 columnas con los 3 campos contenidos dentro del recuadro */}
            <div className="p-3 sm:p-3.5 rounded-xl bg-slate-900 border border-amber-500/30 grid grid-cols-2 gap-2 sm:gap-3 items-center text-xs overflow-hidden">
              {/* Columna 1: Avatar e Identidad del Cliente */}
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br ${currentUser.avatarColor || 'from-amber-600 to-amber-700'} text-white font-bold text-xs sm:text-sm flex items-center justify-center shrink-0 shadow-sm`}>
                  {currentUser.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-white text-xs sm:text-sm leading-tight block truncate">
                    {currentUser.name}
                  </span>
                </div>
              </div>

              {/* Columna 2: Email e Insignia Cuenta Verificada */}
              <div className="flex flex-col items-end justify-center min-w-0 gap-1 text-right">
                {currentUser.email && (
                  <span className="text-[10px] sm:text-xs text-amber-400 font-mono truncate max-w-full block">
                    ({currentUser.email})
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-emerald-400 font-medium text-[10px] sm:text-[11px] border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-md whitespace-nowrap shrink-0">
                  <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span>Cuenta Verificada</span>
                </span>
              </div>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nombre Completo <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    maxLength={20}
                    placeholder="Ej. Martín Rodríguez"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value.slice(0, 20))}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  WhatsApp / Celular (Opcional)
                </label>
                <PhoneInputWithCountry
                  placeholder="Ej. 300 123 4567"
                  value={clientPhone}
                  onChange={(val) => setClientPhone(val)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>
                    Email <span className="text-amber-400">*</span>
                  </span>
                  <span className="text-[10px] text-amber-400/90 font-medium flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Verificado
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    readOnly
                    disabled
                    value={clientEmail}
                    className="w-full px-3.5 py-2.5 bg-slate-900/60 border border-slate-700/60 rounded-xl text-sm font-mono text-slate-400 cursor-not-allowed select-none"
                    title="El correo de tu cuenta verificada no puede ser modificado"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Tu correo de cuenta verificada se utiliza para el registro seguro de la cita.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Preferencia o Nota para el barbero (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Mantener longitud arriba, degradado alto..."
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Booking Summary Card (Regla 5: Duración estándar fija a 30 minutos) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
            <div className="space-y-4">
              <h3 className="font-bold text-white text-sm pb-2 border-b border-slate-800">
                Resumen de la Cita
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Barbero:</span>
                  <span className="font-semibold text-slate-200">
                    {currentBarber ? currentBarber.name : 'Por seleccionar'}
                  </span>
                </div>

                <div className="flex justify-between text-slate-400">
                  <span>Servicio:</span>
                  <span className="font-semibold text-slate-200">
                    {currentService ? currentService.name : 'Por seleccionar'}
                  </span>
                </div>

                {/* Regla 5: Duración fija a 30 minutos */}
                <div className="flex justify-between text-slate-400">
                  <span>Duración:</span>
                  <span className="text-slate-200 font-semibold tabular-nums">30 minutos</span>
                </div>

                <div className="flex justify-between text-slate-400">
                  <span>Fecha:</span>
                  <span className="font-semibold text-slate-200">{formatDateLabel(selectedDate)}</span>
                </div>

                <div className="flex justify-between text-slate-400">
                  <span>Horario:</span>
                  <span className={`font-mono font-bold ${selectedTime ? 'text-amber-400' : 'text-slate-500'}`}>
                    {selectedTime ? formatTimeTo12h(selectedTime) : 'Sin seleccionar'}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-between items-baseline">
                <span className="text-xs text-slate-400">Precio total:</span>
                <span className="text-lg font-mono font-bold text-white tabular-nums">
                  {currentService ? formatCurrency(currentService.price) : '-'}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={
                !currentBarber ||
                !currentService ||
                !selectedTime ||
                isSubmitting ||
                hasReachedActiveBookingLimit ||
                (activeUpcomingAppointments.length > 0 && userAlreadyBookedOnSelectedDate) ||
                (activeUpcomingAppointments.length > 0 && frequencyRestrictions.restrictedDates.has(selectedDate))
              }
              className={`w-full mt-6 py-3 px-4 rounded-xl font-bold text-xs tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${
                currentBarber &&
                currentService &&
                selectedTime &&
                !isSubmitting &&
                !hasReachedActiveBookingLimit &&
                !(activeUpcomingAppointments.length > 0 && userAlreadyBookedOnSelectedDate) &&
                !(activeUpcomingAppointments.length > 0 && frequencyRestrictions.restrictedDates.has(selectedDate))
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/40 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                'Sincronizando...'
              ) : hasReachedActiveBookingLimit ? (
                <span className="inline-flex items-center justify-center gap-1.5 text-rose-400 font-bold">
                  <Lock className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                  LÍMITE MÁXIMO DE 3 CITAS ACTIVAS
                </span>
              ) : activeUpcomingAppointments.length > 0 && frequencyRestrictions.restrictedDates.has(selectedDate) ? (
                <span className="inline-flex items-center justify-center gap-1.5 text-amber-400 font-bold">
                  <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  RESTRICCIÓN 6 DÍAS ACTIVA
                </span>
              ) : activeUpcomingAppointments.length > 0 && userAlreadyBookedOnSelectedDate ? (
                <span className="inline-flex items-center justify-center gap-1.5 text-amber-400 font-bold">
                  <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  YA TIENES CITA EN ESTE DÍA
                </span>
              ) : !currentBarber ? (
                'Elige un barbero'
              ) : !currentService ? (
                'Elige un servicio'
              ) : selectedTime ? (
                `Confirmar Turno (${formatTimeTo12h(selectedTime)})`
              ) : (
                'Selecciona un horario'
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );

  // Helper to render individual slot button
  function renderSlotButton(slot: TimeSlotStatus) {
    const isSelected = selectedTime === slot.time;

    if (slot.status === 'past') {
      return (
        <button
          key={slot.time}
          type="button"
          disabled
          className="py-2 px-1 text-center rounded-lg border border-slate-800/60 bg-slate-900/50 text-slate-400 text-xs font-mono cursor-not-allowed line-through opacity-75"
          title="Horario pasado"
        >
          {formatTimeTo12h(slot.time)}
        </button>
      );
    }

    if (slot.status === 'blocked') {
      return (
        <button
          key={slot.time}
          type="button"
          disabled
          className="py-2 px-1 text-center rounded-lg border border-amber-900/40 bg-amber-950/20 text-amber-500/60 text-xs font-mono cursor-not-allowed"
          title={slot.reason || 'Bloqueado'}
        >
          {formatTimeTo12h(slot.time)}
        </button>
      );
    }

    if (slot.status === 'booked') {
      const isMyBooking = currentUser && slot.appointment && slot.appointment.clientId === currentUser.id;
      return (
        <button
          key={slot.time}
          type="button"
          disabled
          className={`py-2 px-1 text-center rounded-lg border text-xs font-mono cursor-not-allowed ${
            isMyBooking
              ? 'border-amber-500/70 bg-amber-500/15 text-amber-300 font-semibold ring-1 ring-amber-500/30'
              : 'border-slate-800/80 bg-slate-900/70 text-slate-400 line-through opacity-80'
          }`}
          title={isMyBooking ? 'Turno reservado por ti (Gestiona tu cita en la sección Tu Próxima Cita arriba)' : 'Turno ocupado por otro cliente'}
        >
          {formatTimeTo12h(slot.time)}
        </button>
      );
    }

    return (
      <button
        key={slot.time}
        type="button"
        onClick={() => {
          setSelectedTime(slot.time);
          setTimeout(() => {
            document.getElementById('step-confirmation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        }}
        className={`py-2 px-1 text-center rounded-lg border text-xs font-mono font-medium transition-all ${
          isSelected
            ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold shadow-md shadow-amber-950/40 scale-[1.03]'
            : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:border-amber-500/70 hover:text-amber-300 hover:bg-slate-800'
        }`}
      >
        {formatTimeTo12h(slot.time)}
      </button>
    );
  }
};
