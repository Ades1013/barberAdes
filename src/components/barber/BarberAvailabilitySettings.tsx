import React, { useState } from 'react';
import { X, Settings, Clock, Coffee, Calendar, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { Barber } from '../../types';
import { storageService } from '../../services/storageService';
import { realtimeService } from '../../services/realtimeService';
import { formatTimeTo12h } from '../../utils/dateUtils';
import { TimePickerModal } from '../common/TimePickerModal';
import { supabase } from '../../services/supabaseClient';

interface BarberAvailabilitySettingsProps {
  isOpen: boolean;
  onClose: () => void;
  barber: Barber;
  onSaved: () => void;
}

const DAYS_MAP = [
  { id: 1, label: 'Lun' },
  { id: 2, label: 'Mar' },
  { id: 3, label: 'Mié' },
  { id: 4, label: 'Jue' },
  { id: 5, label: 'Vie' },
  { id: 6, label: 'Sáb' },
  { id: 0, label: 'Dom' },
];

const FULL_DAYS_MAP: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  0: 'Domingo',
};

export const BarberAvailabilitySettings: React.FC<BarberAvailabilitySettingsProps> = ({
  isOpen,
  onClose,
  barber,
  onSaved,
}) => {
  const defaultHours = {
    start: '09:00',
    end: '20:00',
    slotDurationMinutes: 30,
    lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
    workingDays: [1, 2, 3, 4, 5, 6],
    specialDaySchedules: [],
  };
  const hours = barber?.workingHours || defaultHours;
  const [startTime, setStartTime] = useState(hours.start || '09:00');
  const [endTime, setEndTime] = useState(hours.end || '20:00');
  const [lunchEnabled, setLunchEnabled] = useState(hours.lunchBreak?.enabled ?? true);
  const [lunchStart, setLunchStart] = useState(hours.lunchBreak?.start || '14:00');
  const [lunchEnd, setLunchEnd] = useState(hours.lunchBreak?.end || '15:00');
  const [workingDays, setWorkingDays] = useState<number[]>(
    Array.isArray(hours.workingDays) ? hours.workingDays : [1, 2, 3, 4, 5, 6]
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  // Requisito 3: Estado de Horario Especial por Día (filtrando excepciones caducadas)
  const [specialSchedules, setSpecialSchedules] = useState<Array<{
    id: string;
    dayOfWeek?: number;
    date?: string;
    start: string;
    end: string;
    label?: string;
  }>>(() => {
    const raw = Array.isArray(hours.specialDaySchedules) ? hours.specialDaySchedules : [];
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return raw.filter((e) => !e || !e.date || e.date >= todayStr);
  });
  const [showAddSpecial, setShowAddSpecial] = useState(false);
  const [showAllExceptions, setShowAllExceptions] = useState(false);
  const [newSpecialType, setNewSpecialType] = useState<'day_of_week' | 'specific_date'>('day_of_week');
  const [newSpecialDayOfWeek, setNewSpecialDayOfWeek] = useState<number>(6); // Sábado por defecto
  const [newSpecialDate, setNewSpecialDate] = useState<string>(() => new Date().toLocaleDateString('en-CA'));
  const [newSpecialStart, setNewSpecialStart] = useState<string>('10:00');
  const [newSpecialEnd, setNewSpecialEnd] = useState<string>('16:00');

  // Submodal activo para selector de 3 columnas (Hora, Minutos, AM/PM)
  const [activeTimePickerField, setActiveTimePickerField] = useState<
    'startTime' | 'endTime' | 'lunchStart' | 'lunchEnd' | 'specialStart' | 'specialEnd' | null
  >(null);

  // Sincronización bidireccional estricta: Día de descanso vinculado con días laborales
  const getInitialRestDay = (days: number[]) => {
    const allDays = [1, 2, 3, 4, 5, 6, 0];
    const missing = allDays.filter((d) => !days.includes(d));
    if (missing.length === 0) return 'none';
    if (missing.includes(0)) return '0';
    return String(missing[0]);
  };

  const [restDay, setRestDay] = useState<string>(() =>
    getInitialRestDay(Array.isArray(hours.workingDays) ? hours.workingDays : [1, 2, 3, 4, 5, 6])
  );
  const [showRestConfirmModal, setShowRestConfirmModal] = useState<boolean>(false);
  const [conflictingAppointments, setConflictingAppointments] = useState<any[]>([]);
  const [pendingRestChange, setPendingRestChange] = useState<{
    nextWorkingDays: number[];
    nextRestDay: string;
    triggerSaveAfterConfirm?: boolean;
  } | null>(null);

  // Calcula la fecha exacta YYYY-MM-DD en los próximos 7 días [hoy, hoy + 6 días] para un día de la semana dado
  const getExactDateForDayOfWeekInNext7Days = (dayOfWeek: number): string => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const currentDay = now.getDay();
    const diff = (dayOfWeek - currentDay + 7) % 7;
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Filtra OBLIGATORIAMENTE por la FECHA EXACTA en formato 'YYYY-MM-DD' (appointment.date === targetDate)
  const findActiveAppointmentsForExactDates = async (exactDatesToCheck: string[]) => {
    const cleanDates = Array.from(
      new Set((exactDatesToCheck || []).map((d) => String(d || '').trim()).filter(Boolean))
    );
    if (cleanDates.length === 0) return [];
    return storageService.getActiveAppointmentsByExactDates(
      String(barber.id || ''),
      cleanDates,
      barber.userId ? String(barber.userId) : undefined
    );
  };

  // Para días recurrentes semanales, evalúa únicamente las citas de los próximos 7 días correspondientes a esa fecha exacta YYYY-MM-DD
  const findActiveAppointmentsForDays = async (daysToCheck: number[], explicitTargetDates?: string[]) => {
    const targetDates: string[] =
      Array.isArray(explicitTargetDates) && explicitTargetDates.length > 0
        ? explicitTargetDates
        : daysToCheck.map((dayOfWeek) => getExactDateForDayOfWeekInNext7Days(dayOfWeek));
    return findActiveAppointmentsForExactDates(targetDates);
  };

  const verifyAndApplyRestDayChange = async (
    daysBeingUnchecked: number[],
    nextWorkingDays: number[],
    nextRestDay: string,
    explicitTargetDates?: string[]
  ) => {
    if (daysBeingUnchecked.length > 0 || (explicitTargetDates && explicitTargetDates.length > 0)) {
      const conflicts = await findActiveAppointmentsForDays(daysBeingUnchecked, explicitTargetDates);
      if (conflicts.length > 0) {
        // Si contiene citas en esa fecha exacta, dispara la alerta de inmediato sin desmarcar el botón hasta confirmar
        setPendingRestChange({
          nextWorkingDays,
          nextRestDay,
          triggerSaveAfterConfirm: false,
        });
        setConflictingAppointments(conflicts);
        setShowRestConfirmModal(true);
        return;
      }
    }

    // Si no tiene citas en esa fecha exacta, se aplica el descanso al instante
    setWorkingDays(nextWorkingDays);
    setRestDay(nextRestDay);
    syncScheduleInstantly({ workingDays: nextWorkingDays, restDay: nextRestDay });
  };

  const handleRestDayChange = (val: string) => {
    const allDays = [1, 2, 3, 4, 5, 6, 0];
    if (val === 'none') {
      setRestDay('none');
      setWorkingDays(allDays);
      syncScheduleInstantly({ workingDays: allDays, restDay: 'none' });
    } else {
      const restNum = Number(val);
      const nextWorkingDays = allDays.filter((d) => d !== restNum);
      const exactTargetDate = getExactDateForDayOfWeekInNext7Days(restNum);
      verifyAndApplyRestDayChange([restNum], nextWorkingDays, val, [exactTargetDate]);
    }
  };

  const lastLocalUpdateRef = React.useRef<number>(0);

  // Clave determinista única por excepción (no depende de IDs aleatorios)
  const getExceptionKey = (s: any) => `${s.dayOfWeek ?? ''}_${s.date ?? ''}_${s.start}_${s.end}`;

  // Sincronización instantánea (0 ms) en memoria, Supabase y Realtime para descansos, pausas y excepciones
  const syncScheduleInstantly = async (overrides?: {
    exceptions?: Array<{
      id: string;
      dayOfWeek?: number;
      date?: string;
      start: string;
      end: string;
      label?: string;
    }>;
    workingDays?: number[];
    restDay?: string;
    lunchEnabled?: boolean;
    lunchStart?: string;
    lunchEnd?: string;
  }) => {
    lastLocalUpdateRef.current = Date.now();

    const effExceptions = overrides?.exceptions !== undefined ? overrides.exceptions : specialSchedules;
    const effWorkingDays = overrides?.workingDays !== undefined ? overrides.workingDays : workingDays;
    const effRestDay = overrides?.restDay !== undefined ? overrides.restDay : restDay;
    const effLunchEnabled = overrides?.lunchEnabled !== undefined ? overrides.lunchEnabled : lunchEnabled;
    const effLunchStart = overrides?.lunchStart !== undefined ? overrides.lunchStart : lunchStart;
    const effLunchEnd = overrides?.lunchEnd !== undefined ? overrides.lunchEnd : lunchEnd;

    const updatedWH: Barber['workingHours'] = {
      start: startTime,
      end: endTime,
      slotDurationMinutes: 30,
      lunchBreak: {
        enabled: effLunchEnabled,
        start: effLunchStart,
        end: effLunchEnd,
      },
      workingDays: effWorkingDays,
      specialDaySchedules: effExceptions,
    };

    // 1. Actualizar estado del barbero en memoria en 0 ms
    barber.workingHours = updatedWH;
    barber.openTime = startTime;
    barber.closeTime = endTime;
    const updatedSchedule = {
      workingDays: barber.workingDaysText || 'Lunes a Sábado',
      openTime: startTime,
      closeTime: endTime,
      exceptions: effExceptions,
      special_hours: effExceptions,
      rest_day: effRestDay,
      work_days: effWorkingDays,
      working_days: effWorkingDays,
      lunch_break: updatedWH.lunchBreak,
      workingHours: updatedWH,
      updatedAt: new Date().toISOString(),
    };
    barber.schedule = updatedSchedule as any;

    // 2. Persistir en almacenamiento local sincronizado
    try {
      await storageService.saveBarberAvailabilitySettings({
        barberId: barber.id,
        userId: barber.userId,
        workingHours: updatedWH,
        restDay: effRestDay,
        email: barber.email,
        persistToCloud: true,
      });

      const localProfileRaw = localStorage.getItem('barbersync_saved_profile');
      const localProfile = localProfileRaw ? JSON.parse(localProfileRaw) : {};
      localProfile.workingHours = updatedWH;
      localProfile.working_hours = updatedWH;
      if (!localProfile.schedule) localProfile.schedule = {};
      localProfile.schedule.exceptions = effExceptions;
      localProfile.schedule.special_hours = effExceptions;
      localProfile.schedule.rest_day = effRestDay;
      localProfile.schedule.work_days = effWorkingDays;
      localProfile.schedule.workingHours = updatedWH;
      localProfile.schedule.lunch_break = updatedWH.lunchBreak;
      localStorage.setItem('barbersync_saved_profile', JSON.stringify(localProfile));
    } catch (e) {
      console.warn('Error saving availability to storage:', e);
    }

    // 3. Persistir de inmediato en Supabase (tabla public.barbers)
    try {
      const isValidUuid = (val?: string) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));
      const targetBarberId = (isValidUuid(barber.id) ? barber.id : null) || (isValidUuid(barber.userId) ? barber.userId : null) || 'bdd42dc3-b0b3-4ae6-9fa4-25d70525765f';
      const cleanEmail = (barber.email || 'juanja1013@gmail.com').toLowerCase().trim();
      const updateData = {
        schedule: updatedSchedule,
        working_hours: updatedWH,
        working_days: effWorkingDays,
        start_time: startTime,
        end_time: endTime,
        updated_at: new Date().toISOString(),
      };

      if (targetBarberId) {
        await supabase
          .from('barbers')
          .update(updateData)
          .eq('id', targetBarberId);
      }
      if (cleanEmail) {
        await supabase
          .from('barbers')
          .update(updateData)
          .eq('email', cleanEmail);
      }
    } catch (err) {
      console.warn('Error sincronizando schedule en Supabase:', err);
    }

    // 4. Emitir evento Realtime a todos los otros dispositivos
    realtimeService.emit({
      type: 'STATUS_CHANGE',
      actor: 'barber',
      payload: { barberId: barber.id, schedule: updatedSchedule, workingHours: updatedWH, exceptions: effExceptions },
      message: 'Disponibilidad y excepciones de horario actualizadas',
    });

    // 5. Notificar al Dashboard padre para actualizar la Matriz y Timeline
    onSaved();
  };

  const handleAddSpecialSchedule = () => {
    const toMinutes = (timeStr: string) => {
      const parts = (timeStr || '').split(':');
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      return h * 60 + m;
    };

    if (toMinutes(newSpecialEnd) <= toMinutes(newSpecialStart)) {
      setValidationError('En el horario especial, la hora de cierre debe ser posterior a la de inicio');
      return;
    }

    if (toMinutes(newSpecialStart) < toMinutes(startTime) || toMinutes(newSpecialEnd) > toMinutes(endTime)) {
      setValidationError(
        `El horario especial debe estar comprendido dentro del horario de atención del local (${formatTimeTo12h(startTime)} - ${formatTimeTo12h(endTime)}).`
      );
      return;
    }

    // Bloquear fechas pasadas en excepciones de fecha puntual
    const todayStr = new Date().toLocaleDateString('en-CA');
    if (newSpecialType === 'specific_date' && newSpecialDate < todayStr) {
      setValidationError('No puedes agregar un horario especial para una fecha que ya pasó.');
      return;
    }

    const fullDayName = FULL_DAYS_MAP[newSpecialDayOfWeek] || 'Día';
    const label = newSpecialType === 'day_of_week'
      ? `Cada ${fullDayName}`
      : `Fecha: ${newSpecialDate}`;

    const item = {
      id: `special-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      dayOfWeek: newSpecialType === 'day_of_week' ? newSpecialDayOfWeek : undefined,
      date: newSpecialType === 'specific_date' ? newSpecialDate : undefined,
      start: newSpecialStart,
      end: newSpecialEnd,
      label,
    };

    const updated = [
      ...specialSchedules.filter((s) =>
        newSpecialType === 'day_of_week' ? s.dayOfWeek !== newSpecialDayOfWeek : s.date !== newSpecialDate
      ),
      item,
    ];
    setSpecialSchedules(updated);
    setShowAddSpecial(false);
    setValidationError(null);

    // Sincronizar en 0 ms en todos los dispositivos
    syncScheduleInstantly({ exceptions: updated });
  };

  const getSpecialScheduleLabel = (item: { dayOfWeek?: number; date?: string; label?: string }): string => {
    if (item.dayOfWeek !== undefined) {
      const fullDay = FULL_DAYS_MAP[item.dayOfWeek];
      if (fullDay) return `Cada ${fullDay}`;
    }
    if (item.label) {
      let text = item.label;
      DAYS_MAP.forEach((d) => {
        const full = FULL_DAYS_MAP[d.id];
        if (full) {
          text = text.replace(new RegExp(`Cada\\s+${d.label}\\b`, 'gi'), `Cada ${full}`);
          if (text.toLowerCase() === d.label.toLowerCase()) text = full;
        }
      });
      return text;
    }
    if (item.date) {
      try {
        const [y, m, d] = item.date.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dayName = FULL_DAYS_MAP[dateObj.getDay()];
        if (dayName) {
          return `${dayName}, ${d} de ${dateObj.toLocaleDateString('es-ES', { month: 'long' })}`;
        }
      } catch {}
      return `Fecha: ${item.date}`;
    }
    return 'Excepción de horario';
  };

  const handleRemoveSpecialSchedule = (itemOrId: any) => {
    const targetKey = typeof itemOrId === 'object' ? getExceptionKey(itemOrId) : null;
    const targetId = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;

    const updated = specialSchedules.filter((s) => {
      if (targetId && s.id && s.id === targetId) return false;
      if (targetKey && getExceptionKey(s) === targetKey) return false;
      return true;
    });

    setSpecialSchedules(updated);
    // Sincronizar eliminación en 0 ms
    syncScheduleInstantly({ exceptions: updated });
  };

  // Requisito 2: Soporte global de tecla Escape (Esc)
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeTimePickerField) {
          setActiveTimePickerField(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTimePickerField, onClose]);

  // Rehidratación infalible ÚNICAMENTE cuando el modal pasa de cerrado a abierto (isOpen pasa a true)
  const prevIsOpenRef = React.useRef(false);

  React.useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    // NUNCA re-sincronizar ni sobrescribir el estado local de excepciones mientras el modal permanezca abierto
    if (!isOpen || wasOpen || !barber) return;

    const bHours = barber.workingHours || defaultHours;
    const currentStart = bHours.start || barber.openTime || (barber.schedule as any)?.openTime || '09:00';
    const currentEnd = bHours.end || barber.closeTime || (barber.schedule as any)?.closeTime || '20:00';
    setStartTime(currentStart);
    setEndTime(currentEnd);

    const lb = bHours.lunchBreak || (barber.schedule as any)?.lunch_break || (barber.schedule as any)?.lunchBreak;
    if (lb) {
      if (lb.enabled !== undefined) setLunchEnabled(Boolean(lb.enabled));
      if (lb.start) setLunchStart(lb.start);
      if (lb.end) setLunchEnd(lb.end);
    }

    const currentDays = Array.isArray(bHours.workingDays)
      ? bHours.workingDays
      : Array.isArray((barber.schedule as any)?.workingDays)
      ? (barber.schedule as any).workingDays
      : [1, 2, 3, 4, 5, 6];
    setWorkingDays(currentDays);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const rawExceptions =
      (Array.isArray((barber.schedule as any)?.exceptions) && (barber.schedule as any).exceptions) ||
      (Array.isArray((barber.schedule as any)?.special_hours) && (barber.schedule as any).special_hours) ||
      (Array.isArray(bHours.specialDaySchedules) && bHours.specialDaySchedules) ||
      [];
    const currentExceptions = (Array.isArray(rawExceptions) ? rawExceptions : []).filter(
      (e: any) => !e || !e.date || e.date >= todayStr
    );
    setSpecialSchedules(currentExceptions);

    const allDays = [1, 2, 3, 4, 5, 6, 0];
    const missingDays = allDays.filter((d) => !currentDays.includes(d));
    let savedRestDay =
      (barber.schedule as any)?.rest_day ??
      (barber as any)?.restDay ??
      getInitialRestDay(currentDays);
    if (missingDays.length === 0) {
      savedRestDay = 'none';
    } else if (savedRestDay !== 'none' && !missingDays.includes(Number(savedRestDay))) {
      savedRestDay = missingDays.includes(0) ? '0' : String(missingDays[0]);
    }
    setRestDay(String(savedRestDay));
  }, [isOpen]);

  // ORDEN 3: Bloquear el scroll del fondo (document.body.style.overflow = 'hidden') mientras el modal esté abierto
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ORDEN 2: Sincronización en caliente si llega una actualización de excepciones desde otro dispositivo vía Realtime
  React.useEffect(() => {
    if (!isOpen || !barber) return;
    // Si la actualización local ocurrió hace menos de 4 segundos, ignorar ecos locales de refresco
    if (Date.now() - lastLocalUpdateRef.current < 4000) return;

    const incoming =
      (Array.isArray((barber.schedule as any)?.exceptions) && (barber.schedule as any).exceptions) ||
      (Array.isArray((barber.schedule as any)?.special_hours) && (barber.schedule as any).special_hours) ||
      (Array.isArray(barber.workingHours?.specialDaySchedules) && barber.workingHours.specialDaySchedules) ||
      null;

    if (incoming) {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const cleanIncoming = incoming.filter((e: any) => !e || !e.date || e.date >= todayStr);
      const currentKeys = specialSchedules.map(getExceptionKey).sort().join('|');
      const incomingKeys = cleanIncoming.map(getExceptionKey).sort().join('|');
      if (currentKeys !== incomingKeys) {
        setSpecialSchedules(cleanIncoming);
      }
    }
  }, [barber?.schedule, barber?.workingHours, isOpen]);

  if (!isOpen) return null;

  const toggleDay = (dayId: number) => {
    const isCurrentlyActive = workingDays.includes(dayId);
    const next = isCurrentlyActive ? workingDays.filter((d) => d !== dayId) : [...workingDays, dayId];
    const allDays = [1, 2, 3, 4, 5, 6, 0];
    const missing = allDays.filter((d) => !next.includes(d));

    let newRest = 'none';
    if (missing.length === 0) {
      newRest = 'none';
    } else if (restDay !== 'none' && missing.includes(Number(restDay))) {
      newRest = restDay;
    } else {
      newRest = missing.includes(0) ? '0' : String(missing[0]);
    }

    if (isCurrentlyActive) {
      // El barbero está desmarcando este día: verificar de inmediato por fecha exacta en los próximos 7 días
      const exactTargetDate = getExactDateForDayOfWeekInNext7Days(dayId);
      verifyAndApplyRestDayChange([dayId], next, newRest, [exactTargetDate]);
    } else {
      setWorkingDays(next);
      setRestDay(newRest);
      syncScheduleInstantly({ workingDays: next, restDay: newRest });
    }
  };

  const checkConflictingAppointmentsForUnselectedDays = (daysToCheck: number[]) => {
    if (daysToCheck.length === 0) return [];
    const cachedApts = storageService.getCachedAppointments();
    const targetDates = daysToCheck.map((dayOfWeek) => getExactDateForDayOfWeekInNext7Days(dayOfWeek));
    const targetBarberId = String(barber.id || '');

    return cachedApts.filter((apt) => {
      const matchBarber =
        !targetBarberId ||
        String(apt.barberId) === targetBarberId ||
        String((apt as any).barber_id) === targetBarberId;
      if (!matchBarber || apt.status === 'cancelled' || apt.status === 'completed') return false;
      return targetDates.some((targetDate) => apt.date === targetDate);
    });
  };

  const executeSave = async () => {
    const updatedWorkingHours: Barber['workingHours'] = {
      start: startTime,
      end: endTime,
      slotDurationMinutes: 30,
      lunchBreak: {
        enabled: lunchEnabled,
        start: lunchStart,
        end: lunchEnd,
      },
      workingDays,
      specialDaySchedules: specialSchedules,
    };

    // Actualizar estado en memoria del barbero
    barber.workingHours = updatedWorkingHours;
    barber.openTime = startTime;
    barber.closeTime = endTime;
    if (!barber.schedule) {
      barber.schedule = {
        workingDays: barber.workingDaysText || 'Lunes a Sábado',
        openTime: startTime,
        closeTime: endTime,
        exceptions: specialSchedules,
        rest_day: restDay,
        lunch_break: updatedWorkingHours.lunchBreak,
      } as any;
    } else {
      barber.schedule.openTime = startTime;
      barber.schedule.closeTime = endTime;
      (barber.schedule as any).exceptions = specialSchedules;
      (barber.schedule as any).special_hours = specialSchedules;
      (barber.schedule as any).rest_day = restDay;
      (barber.schedule as any).lunch_break = updatedWorkingHours.lunchBreak;
    }

    // Actualizar de inmediato localStorage aislado por barbero con las nuevas excepciones
    try {
      const targetKey = barber.userId || barber.id;
      if (targetKey) {
        const localProfileRaw = localStorage.getItem(`barbersync_saved_profile_${targetKey}`);
        const localProfile = localProfileRaw ? JSON.parse(localProfileRaw) : {};
        localProfile.workingHours = updatedWorkingHours;
        localProfile.working_hours = updatedWorkingHours;
        if (!localProfile.schedule) localProfile.schedule = {};
        localProfile.schedule.exceptions = specialSchedules;
        localProfile.schedule.special_hours = specialSchedules;
        localProfile.schedule.rest_day = restDay;
        localProfile.schedule.workingHours = updatedWorkingHours;
        localProfile.schedule.lunch_break = updatedWorkingHours.lunchBreak;
        localStorage.setItem(`barbersync_saved_profile_${targetKey}`, JSON.stringify(localProfile));
      }
    } catch {}

    // Persistencia infalible en tabla barbers y localStorage
    await storageService.saveBarberAvailabilitySettings({
      barberId: barber.id,
      userId: barber.userId,
      workingHours: updatedWorkingHours,
      restDay,
      email: barber.email,
      persistToCloud: true,
    });

    try {
      const targetUserId = barber.userId || barber.id;
      const updateData = {
        schedule: barber.schedule,
        working_hours: updatedWorkingHours,
        working_days: workingDays,
        start_time: startTime,
        end_time: endTime,
        updated_at: new Date().toISOString(),
      };

      if (targetUserId) {
        await supabase
          .from('barbers')
          .update(updateData)
          .eq('user_id', targetUserId);
      }
    } catch (err) {
      console.warn('Error sincronizando schedule en Supabase en handleSave:', err);
    }

    realtimeService.emit({
      type: 'STATUS_CHANGE',
      actor: 'barber',
      payload: { barberId: barber.id, workingHours: updatedWorkingHours, schedule: barber.schedule },
      message: `${barber.name} actualizó su disponibilidad y horarios de atención.`,
    });

    onSaved();
    onClose();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Requisito 3: Validación estricta de horarios
    const toMinutes = (timeStr: string) => {
      const parts = (timeStr || '').split(':');
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      return h * 60 + m;
    };

    if (toMinutes(endTime) <= toMinutes(startTime)) {
      setValidationError('La hora de cierre debe ser posterior a la hora de inicio');
      return;
    }

    if (lunchEnabled && toMinutes(lunchEnd) <= toMinutes(lunchStart)) {
      setValidationError('El fin de almuerzo debe ser posterior al inicio de almuerzo');
      return;
    }

    // Comprobación de citas activas por CADA día desmarcado al momento de guardar
    const allDays = [1, 2, 3, 4, 5, 6, 0];
    const unselectedDays = allDays.filter((d) => !workingDays.includes(d));
    const conflicting = await findActiveAppointmentsForDays(unselectedDays);

    if (conflicting.length > 0) {
      setPendingRestChange({
        nextWorkingDays: workingDays,
        nextRestDay: restDay,
        triggerSaveAfterConfirm: true,
      });
      setConflictingAppointments(conflicting);
      setShowRestConfirmModal(true);
      return;
    }

    await executeSave();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <form
        onSubmit={handleSave}
        className="flex flex-col w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-[#0B0F17] border border-slate-800 shadow-2xl text-slate-100"
      >
        {/* Cabecera integrada en el scroll */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-[#0B0F17]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Configurar Disponibilidad</h2>
              <p className="text-xs text-slate-400">
                Personaliza tus horas de atención, día de descanso y pausas.
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

        {/* Cuerpo con Scroll libre desde el contenedor */}
        <div className="px-6 py-5 space-y-6">
          {validationError && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/60 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{validationError}</div>
            </div>
          )}

          {/* Working Hours con Selectores Interactivos Unificados */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Horario de Trabajo General</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">Hora Inicio</span>
                <div
                  onClick={() => setActiveTimePickerField('startTime')}
                  className="relative cursor-pointer group"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveTimePickerField('startTime');
                    }
                  }}
                >
                  <Clock className="w-4 h-4 text-amber-400 group-hover:text-amber-300 transition-colors absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer" />
                  <div className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 group-hover:border-amber-500/80 rounded-xl text-xs text-white transition-colors flex items-center justify-between shadow-xs">
                    <span className="font-semibold text-white tracking-wide font-mono">
                      {formatTimeTo12h(startTime)}
                    </span>
                    <span className="text-[10px] text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                      Elegir
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block mb-1">Hora Cierre</span>
                <div
                  onClick={() => setActiveTimePickerField('endTime')}
                  className="relative cursor-pointer group"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveTimePickerField('endTime');
                    }
                  }}
                >
                  <Clock className="w-4 h-4 text-amber-400 group-hover:text-amber-300 transition-colors absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer" />
                  <div className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 group-hover:border-amber-500/80 rounded-xl text-xs text-white transition-colors flex items-center justify-between shadow-xs">
                    <span className="font-semibold text-white tracking-wide font-mono">
                      {formatTimeTo12h(endTime)}
                    </span>
                    <span className="text-[10px] text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                      Elegir
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Requisito 4: Selector de Día de Descanso en lugar de duración de turno */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>¿Qué día descansarás esta semana?</span>
            </label>
            <select
              value={restDay}
              onChange={(e) => handleRestDayChange(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition-colors shadow-xs cursor-pointer"
            >
              <option value="1" className="bg-slate-900 text-white">Lunes</option>
              <option value="2" className="bg-slate-900 text-white">Martes</option>
              <option value="3" className="bg-slate-900 text-white">Miércoles</option>
              <option value="4" className="bg-slate-900 text-white">Jueves</option>
              <option value="5" className="bg-slate-900 text-white">Viernes</option>
              <option value="6" className="bg-slate-900 text-white">Sábado</option>
              <option value="0" className="bg-slate-900 text-white">Domingo</option>
              <option value="none" className="bg-slate-900 text-white">No descansaré</option>
            </select>
          </div>

          {/* Lunch Break con selectores interactivos */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-slate-200">Pausa de Almuerzo Automática</span>
              </div>
              <input
                type="checkbox"
                checked={lunchEnabled}
                onChange={(e) => setLunchEnabled(e.target.checked)}
                className="w-4 h-4 accent-amber-500 cursor-pointer"
              />
            </div>

            {lunchEnabled && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Inicio Almuerzo</span>
                  <div
                    onClick={() => setActiveTimePickerField('lunchStart')}
                    className="relative cursor-pointer group"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveTimePickerField('lunchStart');
                      }
                    }}
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-300 transition-colors absolute left-2.5 top-1/2 -translate-y-1/2 cursor-pointer" />
                    <div className="w-full pl-8 pr-2.5 py-1.5 bg-slate-950 border border-slate-700 group-hover:border-amber-500/80 rounded-lg text-xs text-white transition-colors flex items-center justify-between shadow-xs">
                      <span className="font-semibold text-white tracking-wide font-mono text-[11px]">
                        {formatTimeTo12h(lunchStart)}
                      </span>
                      <span className="text-[9px] text-amber-400 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                        Elegir
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Fin Almuerzo</span>
                  <div
                    onClick={() => setActiveTimePickerField('lunchEnd')}
                    className="relative cursor-pointer group"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveTimePickerField('lunchEnd');
                      }
                    }}
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-300 transition-colors absolute left-2.5 top-1/2 -translate-y-1/2 cursor-pointer" />
                    <div className="w-full pl-8 pr-2.5 py-1.5 bg-slate-950 border border-slate-700 group-hover:border-amber-500/80 rounded-lg text-xs text-white transition-colors flex items-center justify-between shadow-xs">
                      <span className="font-semibold text-white tracking-wide font-mono text-[11px]">
                        {formatTimeTo12h(lunchEnd)}
                      </span>
                      <span className="text-[9px] text-amber-400 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                        Elegir
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Requisito 3: Horario Especial por Día (Opcional) */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-slate-200">Horario Especial por Día (Opcional)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSpecial(!showAddSpecial)}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddSpecial ? 'Cerrar' : 'Agregar Excepción'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Define un horario diferente para un día de la semana o fecha puntual (ej. cerrar más temprano un martes o sábado) sin alterar los demás días.
            </p>

            {/* Formulario para agregar horario especial */}
            {showAddSpecial && (
              <div className="p-3 rounded-lg bg-slate-950/80 border border-amber-500/30 space-y-2.5 animate-in fade-in duration-150">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Tipo de Excepción</label>
                    <select
                      value={newSpecialType}
                      onChange={(e) => setNewSpecialType(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="day_of_week">Día de la Semana</option>
                      <option value="specific_date">Fecha Puntual</option>
                    </select>
                  </div>

                  <div>
                    {newSpecialType === 'day_of_week' ? (
                      <>
                        <label className="text-[10px] text-slate-400 block mb-1">Día a Modificar</label>
                        <select
                          value={newSpecialDayOfWeek}
                          onChange={(e) => setNewSpecialDayOfWeek(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                        >
                          <option value="1">Lunes</option>
                          <option value="2">Martes</option>
                          <option value="3">Miércoles</option>
                          <option value="4">Jueves</option>
                          <option value="5">Viernes</option>
                          <option value="6">Sábado</option>
                          <option value="0">Domingo</option>
                        </select>
                      </>
                    ) : (
                      <>
                        <label className="text-[10px] text-slate-400 block mb-1">Fecha</label>
                        <input
                          type="date"
                          min={new Date().toLocaleDateString('en-CA')}
                          value={newSpecialDate}
                          onChange={(e) => setNewSpecialDate(e.target.value)}
                          className="w-full bg-slate-900 border border-amber-500/50 text-amber-400 font-bold px-3 py-2 rounded-lg text-sm [color-scheme:dark] focus:outline-none focus:border-amber-400"
                        />
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Hora Inicio</span>
                    <div
                      onClick={() => setActiveTimePickerField('specialStart')}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 hover:border-amber-500 rounded-lg text-xs text-white flex items-center justify-between cursor-pointer"
                    >
                      <span className="font-mono">{formatTimeTo12h(newSpecialStart)}</span>
                      <span className="text-[9px] text-amber-400 font-medium">Elegir</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Hora Cierre</span>
                    <div
                      onClick={() => setActiveTimePickerField('specialEnd')}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 hover:border-amber-500 rounded-lg text-xs text-white flex items-center justify-between cursor-pointer"
                    >
                      <span className="font-mono">{formatTimeTo12h(newSpecialEnd)}</span>
                      <span className="text-[9px] text-amber-400 font-medium">Elegir</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddSpecialSchedule}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  Confirmar Excepción de Horario
                </button>
              </div>
            )}

            {/* Lista de excepciones activas - Máximo 3 por defecto */}
            {specialSchedules.length > 0 && (() => {
              const sorted = [...specialSchedules].sort((a, b) => {
                if (a.date && b.date) return b.date.localeCompare(a.date);
                if (a.date) return -1;
                if (b.date) return 1;
                return (a.dayOfWeek || 0) - (b.dayOfWeek || 0);
              });
              const displayed = showAllExceptions ? sorted : sorted.slice(0, 3);

              return (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Excepciones Activas ({specialSchedules.length})
                    </span>
                    {specialSchedules.length > 3 && (
                      <span className="text-[10px] text-amber-400 font-semibold">
                        {showAllExceptions ? 'Todas visibles' : '3 más recientes'}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {displayed.map((item) => (
                      <div
                        key={item.id || getExceptionKey(item)}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <div>
                            <strong className="text-white block font-medium">
                              {getSpecialScheduleLabel(item)}
                            </strong>
                            <span className="text-[11px] text-amber-400/90 font-mono">
                              {formatTimeTo12h(item.start)} - {formatTimeTo12h(item.end)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSpecialSchedule(item)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="Eliminar excepción"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {specialSchedules.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setShowAllExceptions((prev) => !prev)}
                      className="w-full py-1.5 px-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-semibold text-amber-400 hover:text-amber-300 hover:bg-slate-800/80 transition-colors text-center cursor-pointer mt-1"
                    >
                      {showAllExceptions
                        ? '▲ Colapsar excepciones'
                        : `▼ Ver ${specialSchedules.length - 3} excepciones más`}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Working Days */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">Días Laborales</label>
            <div className="flex items-center gap-1.5">
              {DAYS_MAP.map((d) => {
                const isActive = workingDays.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer shadow-xs ${
                      isActive
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Pie de acciones */}
        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3 bg-[#0B0F17]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shadow-xs cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-md cursor-pointer"
          >
            Guardar Configuración
          </button>
        </div>
      </form>

        {/* Submodal selector interactivo de 3 columnas (Hora, Minutos, AM/PM) */}
        {activeTimePickerField && (
          <TimePickerModal
            isOpen={Boolean(activeTimePickerField)}
            onClose={() => setActiveTimePickerField(null)}
            title={
              activeTimePickerField === 'startTime'
                ? 'Hora de Inicio de Atención'
                : activeTimePickerField === 'endTime'
                ? 'Hora de Cierre de Atención'
                : activeTimePickerField === 'lunchStart'
                ? 'Inicio de Almuerzo'
                : activeTimePickerField === 'lunchEnd'
                ? 'Fin de Almuerzo'
                : activeTimePickerField === 'specialStart'
                ? 'Hora Inicio Horario Especial'
                : 'Hora Cierre Horario Especial'
            }
            value={
              activeTimePickerField === 'startTime'
                ? startTime
                : activeTimePickerField === 'endTime'
                ? endTime
                : activeTimePickerField === 'lunchStart'
                ? lunchStart
                : activeTimePickerField === 'lunchEnd'
                ? lunchEnd
                : activeTimePickerField === 'specialStart'
                ? newSpecialStart
                : newSpecialEnd
            }
            minTime={
              activeTimePickerField === 'lunchStart' ||
              activeTimePickerField === 'lunchEnd' ||
              activeTimePickerField === 'specialStart' ||
              activeTimePickerField === 'specialEnd'
                ? startTime
                : undefined
            }
            maxTime={
              activeTimePickerField === 'lunchStart' ||
              activeTimePickerField === 'lunchEnd' ||
              activeTimePickerField === 'specialStart' ||
              activeTimePickerField === 'specialEnd'
                ? endTime
                : undefined
            }
            onChange={(newTime24) => {
              if (activeTimePickerField === 'startTime') setStartTime(newTime24);
              else if (activeTimePickerField === 'endTime') setEndTime(newTime24);
              else if (activeTimePickerField === 'lunchStart') setLunchStart(newTime24);
              else if (activeTimePickerField === 'lunchEnd') setLunchEnd(newTime24);
              else if (activeTimePickerField === 'specialStart') setNewSpecialStart(newTime24);
              else if (activeTimePickerField === 'specialEnd') setNewSpecialEnd(newTime24);
              setValidationError(null);
              setActiveTimePickerField(null);
            }}
          />
        )}
        {/* Modal de Confirmación Inmediata para Día de Descanso con Citas Programadas */}
        {showRestConfirmModal && conflictingAppointments.length > 0 && (
          <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#12151b] border border-amber-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Día con Citas Programadas
                  </h3>
                  <p className="text-xs text-amber-300 font-medium mt-0.5">
                    {Array.from(
                      new Set(
                        conflictingAppointments.map((apt) => {
                          const [y, m, d] = apt.date.split('-').map(Number);
                          const dayOfWeek = new Date(y, m - 1, d).getDay();
                          return FULL_DAYS_MAP[dayOfWeek] || 'Día';
                        })
                      )
                    ).join(', ')}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 space-y-2">
                <p className="font-bold text-white text-xs leading-relaxed">
                  Este día tiene citas programadas. ¿Deseas cancelar todas las citas de este día para aplicar el descanso?
                </p>
                <p className="text-[11px] text-slate-300">
                  Se detectaron <strong className="text-amber-400">{conflictingAppointments.length}</strong> {conflictingAppointments.length === 1 ? 'cita programada' : 'citas programadas'} en el día seleccionado.
                </p>
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {conflictingAppointments.map((apt) => (
                  <div key={apt.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-white truncate block">{apt.clientName}</span>
                      <span className="text-[11px] text-slate-400 truncate block">{apt.date} · {apt.serviceName}</span>
                    </div>
                    <span className="font-mono font-bold text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 shrink-0">
                      {formatTimeTo12h(apt.time)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    // Si elige "No", el botón no se desmarca y se mantienen las citas
                    setShowRestConfirmModal(false);
                    setConflictingAppointments([]);
                    setPendingRestChange(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const pending = pendingRestChange;
                    setShowRestConfirmModal(false);
                    for (const apt of conflictingAppointments) {
                      await storageService.updateAppointmentStatus(apt.id, 'cancelled', { cancelledBy: 'barber' });
                    }
                    realtimeService.emit({
                      type: 'CANCEL_BOOKING',
                      actor: 'barber',
                      payload: { barberId: barber.id, count: conflictingAppointments.length },
                      message: 'Citas canceladas automáticamente al definir día de descanso',
                    });
                    setConflictingAppointments([]);
                    setPendingRestChange(null);

                    if (pending) {
                      setWorkingDays(pending.nextWorkingDays);
                      setRestDay(pending.nextRestDay);
                      await syncScheduleInstantly({
                        workingDays: pending.nextWorkingDays,
                        restDay: pending.nextRestDay,
                      });
                      if (pending.triggerSaveAfterConfirm) {
                        await executeSave();
                      }
                    } else {
                      await executeSave();
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-950/40 cursor-pointer"
                >
                  Sí, cancelar citas y aplicar descanso
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};
