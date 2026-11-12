import { Barber, Appointment, BlockedSlot } from '../types';

export interface TimeSlotStatus {
  time: string; // "14:00"
  status: 'available' | 'booked' | 'blocked' | 'past';
  appointment?: Appointment;
  blockedSlot?: BlockedSlot;
  reason?: string;
  isLunchBreak?: boolean;
}

export function formatTimeTo12h(timeStr: string): string {
  if (!timeStr || !timeStr.trim()) return '';
  return normalizeTime(timeStr);
}

/**
 * Normaliza cualquier string de hora (ej: "09:00 AM", "9:00 a.m.", "09:00", "14:00", "2:00 pm")
 * al formato exacto uniforme utilizado por la Matriz: "9:00 am", "9:30 am", "12:00 pm", "3:30 pm".
 */
export function normalizeTime(timeStr: string): string {
  if (!timeStr || !timeStr.trim()) return '';
  const clean = timeStr.trim().toLowerCase();

  const isPm = clean.includes('pm') || clean.includes('p.m.') || clean.includes('p. m.') || clean.includes(' tarde') || clean.includes(' noche');
  const isAm = clean.includes('am') || clean.includes('a.m.') || clean.includes('a. m.') || clean.includes(' mañana');

  const numbers = clean.replace(/[^0-9:]/g, '');
  if (!numbers) return timeStr;

  const parts = numbers.split(':');
  let h = parseInt(parts[0], 10);
  let m = parts[1] !== undefined ? parseInt(parts[1], 10) : 0;
  if (isNaN(h)) return timeStr;
  if (isNaN(m)) m = 0;

  // Convert to 24h
  if (isPm && h < 12) h += 12;
  if (isAm && h === 12) h = 0;

  // Convert to 12h format: "9:00 am", "9:30 am", "12:00 pm", "3:30 pm"
  const period = h >= 12 ? 'pm' : 'am';
  const hours12 = h % 12 === 0 ? 12 : h % 12;
  const minsStr = m.toString().padStart(2, '0');

  return `${hours12}:${minsStr} ${period}`;
}

/**
 * Normaliza a formato HH:mm 24 horas (ej. "09:00", "14:30")
 */
export function normalizeTimeTo24h(timeStr: string, defaultFallback: string = ''): string {
  if (!timeStr || !timeStr.trim()) return defaultFallback;
  const clean = timeStr.trim().toLowerCase();

  const isPm = clean.includes('pm') || clean.includes('p.m.') || clean.includes('p. m.');
  const isAm = clean.includes('am') || clean.includes('a.m.') || clean.includes('a. m.');

  const numbers = clean.replace(/[^0-9:]/g, '');
  if (!numbers) return defaultFallback || timeStr;

  const parts = numbers.split(':');
  let h = parseInt(parts[0], 10);
  let m = parts[1] !== undefined ? parseInt(parts[1], 10) : 0;
  if (isNaN(h)) return defaultFallback || timeStr;
  if (isNaN(m)) m = 0;

  if (isPm && h < 12) h += 12;
  if (isAm && h === 12) h = 0;

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const STANDARD_WORKING_DAYS = [
  'Lunes a Sábado',
  'Lunes a Domingo',
  'Lunes a Viernes',
  'Martes a Domingo',
  'Fines de semana',
] as const;

export function normalizeWorkingDays(raw?: any): string {
  if (!raw) return 'Lunes a Sábado';

  // Si es un array de números o strings (ej. [1,2,3,4,5,6] o ["1","2","3","4","5","6"])
  if (Array.isArray(raw)) {
    const numList = raw
      .map((item) => (typeof item === 'number' ? item : parseInt(String(item), 10)))
      .filter((n) => !isNaN(n));

    if (numList.length === 0) return 'Lunes a Sábado';

    // Chequear patrones comunes
    const has0 = numList.includes(0);
    const has6 = numList.includes(6);
    const has7 = numList.includes(7);
    const hasSunday = has0 || has7;

    if (numList.length >= 7 || (hasSunday && numList.includes(1) && has6)) {
      return 'Lunes a Domingo';
    }
    if (!hasSunday && numList.includes(1) && has6) {
      return 'Lunes a Sábado';
    }
    if (!hasSunday && !has6 && numList.includes(1) && numList.includes(5)) {
      return 'Lunes a Viernes';
    }
    if (numList.includes(2) && hasSunday) {
      return 'Martes a Domingo';
    }
    if ((numList.includes(6) && hasSunday) || numList.length === 2) {
      return 'Fines de semana';
    }
    return 'Lunes a Sábado';
  }

  // Si es un objeto tipo schedule
  if (typeof raw === 'object' && raw !== null) {
    const candidate = raw.workingDays || raw.workingDaysText || raw.days || raw.label;
    if (candidate) return normalizeWorkingDays(candidate);
    return 'Lunes a Sábado';
  }

  // Si es string
  const str = String(raw).trim();
  if (STANDARD_WORKING_DAYS.includes(str as any)) {
    return str;
  }

  // Si es una cadena numérica como "123456" o "1, 2, 3, 4, 5, 6"
  const digitsOnly = str.replace(/[^0-9]/g, '');
  if (digitsOnly === '123456') return 'Lunes a Sábado';
  if (digitsOnly === '1234567' || digitsOnly === '0123456') return 'Lunes a Domingo';
  if (digitsOnly === '12345') return 'Lunes a Viernes';
  if (digitsOnly === '234567' || digitsOnly === '234560') return 'Martes a Domingo';
  if (digitsOnly === '67' || digitsOnly === '06') return 'Fines de semana';

  // Búsqueda de subcadenas
  const lower = str.toLowerCase();
  if (lower.includes('fin') || lower.includes('fines')) return 'Fines de semana';
  if (lower.includes('martes') && (lower.includes('domingo') || lower.includes('dom'))) return 'Martes a Domingo';
  if (lower.includes('lunes') && (lower.includes('viernes') || lower.includes('vie'))) return 'Lunes a Viernes';
  if (lower.includes('lunes') && (lower.includes('domingo') || lower.includes('dom'))) return 'Lunes a Domingo';
  if (lower.includes('lunes') && (lower.includes('sabado') || lower.includes('sábado') || lower.includes('sab'))) return 'Lunes a Sábado';

  return 'Lunes a Sábado';
}

export function formatScheduleDisplay(daysText?: any, start?: string, end?: string): string {
  let resolvedDaysInput = daysText;
  let resolvedStart = start;
  let resolvedEnd = end;

  if (typeof daysText === 'object' && daysText !== null && !Array.isArray(daysText)) {
    resolvedDaysInput = daysText.workingDays || daysText.workingDaysText || daysText.days || daysText.label;
    if (!resolvedStart && (daysText.openTime || daysText.start || daysText.open_time)) {
      resolvedStart = daysText.openTime || daysText.start || daysText.open_time;
    }
    if (!resolvedEnd && (daysText.closeTime || daysText.end || daysText.close_time)) {
      resolvedEnd = daysText.closeTime || daysText.end || daysText.close_time;
    }
  }

  const normalizedDays = normalizeWorkingDays(resolvedDaysInput);
  const startTime = resolvedStart ? formatTimeTo12h(String(resolvedStart)) : '9:00 am';
  const endTime = resolvedEnd ? formatTimeTo12h(String(resolvedEnd)) : '8:00 pm';

  let shortDays = normalizedDays;
  if (/lunes\s+a\s+s[aá]bado/i.test(normalizedDays)) shortDays = 'Lun - Sáb';
  else if (/lunes\s+a\s+domingo/i.test(normalizedDays)) shortDays = 'Lun - Dom';
  else if (/lunes\s+a\s+viernes/i.test(normalizedDays)) shortDays = 'Lun - Vie';
  else if (/martes\s+a\s+domingo/i.test(normalizedDays)) shortDays = 'Mar - Dom';
  else if (/martes\s+a\s+s[aá]bado/i.test(normalizedDays)) shortDays = 'Mar - Sáb';
  else if (/fines?\s+de\s+semana/i.test(normalizedDays)) shortDays = 'Fin de Semana (Sáb - Dom)';

  return `${shortDays} · ${startTime} - ${endTime}`;
}

export const DAY_TEXT_TO_NUM: Record<string, number> = {
  dom: 0, domingo: 0, sun: 0, sunday: 0,
  lun: 1, lunes: 1, mon: 1, monday: 1,
  mar: 2, martes: 2, tue: 2, tuesday: 2,
  mie: 3, mié: 3, miercoles: 3, miércoles: 3, wed: 3, wednesday: 3,
  jue: 4, jueves: 4, thu: 4, thursday: 4,
  vie: 5, viernes: 5, fri: 5, friday: 5,
  sab: 6, sáb: 6, sabado: 6, sábado: 6, sat: 6, saturday: 6,
};

export function normalizeWorkingDaysToNumbers(rawDays?: any, fallbackText?: string): number[] {
  if (Array.isArray(rawDays)) {
    const parsed = rawDays
      .map((item) => {
        if (typeof item === 'number') {
          return item === 7 ? 0 : item;
        }
        if (typeof item === 'string') {
          const trimmed = item.trim().toLowerCase();
          if (/^\d+$/.test(trimmed)) {
            const n = parseInt(trimmed, 10);
            return n === 7 ? 0 : n;
          }
          if (DAY_TEXT_TO_NUM[trimmed] !== undefined) {
            return DAY_TEXT_TO_NUM[trimmed];
          }
          for (const [key, val] of Object.entries(DAY_TEXT_TO_NUM)) {
            if (trimmed.startsWith(key)) return val;
          }
        }
        return -1;
      })
      .filter((n) => n >= 0 && n <= 6);

    if (parsed.length > 0) {
      return Array.from(new Set(parsed)).sort((a, b) => a - b);
    }
  }

  const textCandidate =
    (typeof rawDays === 'string' && rawDays) ||
    fallbackText ||
    'Lunes a Sábado';

  return parseWorkingDaysText(textCandidate);
}

export function parseWorkingDaysText(daysText?: any): number[] {
  if (!daysText) return [1, 2, 3, 4, 5, 6];
  if (Array.isArray(daysText)) {
    const asNums = normalizeWorkingDaysToNumbers(daysText);
    if (asNums.length > 0) return asNums;
    daysText = daysText.join(' ');
  } else if (typeof daysText === 'object' && daysText !== null) {
    if (Array.isArray(daysText.workingDays)) return normalizeWorkingDaysToNumbers(daysText.workingDays);
    if (Array.isArray(daysText.workingDaysArray)) return normalizeWorkingDaysToNumbers(daysText.workingDaysArray);
    daysText = daysText.workingDays || daysText.days || daysText.workingDaysText || '';
  }

  const t = String(daysText || '').toLowerCase();
  if (t.includes('fines de semana') || t.includes('fin de semana')) {
    return [0, 6];
  }
  if (t.includes('domingo') && (t.includes('lunes a') || t.includes('lun - dom') || t.includes('todos los d') || t.includes('lunes a domingo'))) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  if (t.includes('sábado') || t.includes('sabado') || t.includes('sáb') || t.includes('sab')) {
    if (t.includes('martes')) {
      return [2, 3, 4, 5, 6];
    }
    return [1, 2, 3, 4, 5, 6];
  }
  if (t.includes('viernes') || t.includes('vie')) {
    return [1, 2, 3, 4, 5];
  }
  if (t.includes('martes') && t.includes('domingo')) {
    return [0, 2, 3, 4, 5, 6];
  }
  return [1, 2, 3, 4, 5, 6];
}

/**
 * Genera el siguiente código correlativo de reserva con formato "#ISO - 000000"
 * Ej. "#CO - 002295"
 * Aplica módulo a 1.000.000 para reiniciar a 0 al llegar a 999.999 / 1.000.000
 */
let memorySeqCounter = 2294;

export function generateNextBookingCode(countryIso: string = 'CO'): string {
  const cleanIso = (countryIso || 'CO').trim().toUpperCase();
  try {
    const STORAGE_KEY = 'barbersync_booking_seq_counter';
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    let nextVal = memorySeqCounter;
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) {
        nextVal = parsed;
      }
    }
    // Scan existing cached appointments to ensure nextVal is strictly higher than any existing code
    if (typeof window !== 'undefined') {
      try {
        const rawApts = localStorage.getItem('barbersync_appointments_v1');
        if (rawApts) {
          const apts = JSON.parse(rawApts);
          if (Array.isArray(apts)) {
            for (const a of apts) {
              if (a && a.code) {
                const nums = a.code.replace(/\D/g, '');
                if (nums) {
                  const val = parseInt(nums, 10);
                  if (!isNaN(val) && val >= nextVal) {
                    nextVal = val;
                  }
                }
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }
    // Incremento correlativo y reinicio a 0 con módulo 1.000.000
    nextVal = (nextVal + 1) % 1000000;
    memorySeqCounter = nextVal;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, nextVal.toString());
    }
    const padded = String(nextVal).padStart(6, '0');
    return `#${cleanIso} - ${padded}`;
  } catch {
    memorySeqCounter = (memorySeqCounter + 1) % 1000000;
    return `#${cleanIso} - ${String(memorySeqCounter).padStart(6, '0')}`;
  }
}

/**
 * Normaliza o formatea cualquier código de reserva al estándar "#ISO - 000000"
 */
export function formatBookingCode(code?: string, countryIso: string = 'CO'): string {
  const cleanIso = (countryIso || 'CO').trim().toUpperCase();
  if (!code) return `#${cleanIso} - 000001`;

  const trimmed = code.trim();
  // Si ya tiene el formato exacto "#XX - 000000"
  if (/^#[A-Z]{2}\s*-\s*\d{6}$/.test(trimmed)) {
    return trimmed;
  }
  // Extraer dígitos numéricos (ej. "#BS-3012" -> 3012 -> 003012)
  const digits = code.replace(/\D/g, '');
  if (digits) {
    const num = parseInt(digits, 10) % 1000000;
    return `#${cleanIso} - ${String(num).padStart(6, '0')}`;
  }
  return `#${cleanIso} - 002295`;
}

export function getDayName(dateString: string): string {
  const [year, month, day] = dateString.split(/[-/T\s]/).map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[date.getDay()];
}

export function formatDateLabel(dateString: string): string {
  const [year, month, day] = dateString.split(/[-/T\s]/).map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  const months = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];
  return `${day} ${months[date.getMonth()]}`;
}

export function getNextDays(
  count: number = 14,
  startDateStr?: string
): { date: string; dayName: string; label: string; isToday: boolean }[] {
  const days = [];
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  let baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  if (startDateStr) {
    const parts = startDateStr.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      baseDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    }
  }

  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + i, 12, 0, 0);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    days.push({
      date: dateStr,
      dayName: dateStr === todayStr ? 'Hoy' : getDayName(dateStr),
      label: formatDateLabel(dateStr),
      isToday: dateStr === todayStr,
    });
  }
  return days;
}

function timeToMinutes(timeStr: string): number {
  const [hours, mins] = timeStr.split(':').map(Number);
  return hours * 60 + mins;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function generateDailySlots(
  barber: Barber,
  dateString: string,
  appointments: Appointment[],
  blockedSlots: BlockedSlot[],
  unblockedExceptions?: { barberId: string; date: string; time: string }[]
): TimeSlotStatus[] {
  // Read local unblocked exceptions if not directly passed
  const exceptions =
    unblockedExceptions ??
    (typeof window !== 'undefined'
      ? (() => {
          try {
            const data = localStorage.getItem('barbersync_unblocked_exceptions_v1');
            return data ? JSON.parse(data) : [];
          } catch {
            return [];
          }
        })()
      : []);

  // Parseo directo de la fecha YYYY-MM-DD usando componentes locales al mediodía (12:00) para evitar desfases UTC
  const [year, month, day] = (dateString || '').split(/[-/T\s]/).map(Number);
  const targetDate = new Date(year, month - 1, day, 12, 0, 0);
  const dayOfWeek = targetDate.getDay();
  const targetDateKey = (dateString || '').split('T')[0].trim();

  // Filter relevant appointments for this barber and date that are not cancelled
  const cleanBarberId = (barber.id || '').replace(/^b-/, '').trim().toLowerCase();
  const cleanBarberName = (barber.name || '').trim().toLowerCase();

  const dayAppointments = (appointments || []).filter((apt) => {
    if (!apt) return false;
    const aptDate = (apt.date || (apt as any).appointment_date || '').trim();
    const isSameDate = aptDate === targetDateKey;
    const aptBarberId = apt.barberId || (apt as any).barber_id || '';
    const cleanAptBarberId = aptBarberId.replace(/^b-/, '').trim().toLowerCase();
    const cleanAptBarberName = (apt.barberName || (apt as any).barber_name || '').trim().toLowerCase();
    const aptEmail = (apt.barberEmail || (apt as any).barber_email || '').trim().toLowerCase();
    const barberEmail = (barber.email || '').trim().toLowerCase();

    const isSameBarber =
      aptBarberId === barber.id ||
      (Boolean(barber.userId) && (aptBarberId === barber.userId || cleanAptBarberId === (barber.userId || '').replace(/^b-/, '').trim().toLowerCase())) ||
      (Boolean(barberEmail) && Boolean(aptEmail) && aptEmail === barberEmail) ||
      cleanAptBarberId === cleanBarberId ||
      (cleanAptBarberName && cleanBarberName && cleanAptBarberName === cleanBarberName);

    return isSameDate && isSameBarber && apt.status !== 'cancelled';
  });

  // Compatibilidad bidireccional entre formatos de días laborales:
  // Admite tanto índices numéricos [1, 2, 3, 4, 5, 6] como cadenas de texto ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] o 'Lunes a Sábado'
  const rawWorkingDays =
    barber?.workingHours?.workingDays ||
    (barber as any)?.schedule?.working_days ||
    (barber as any)?.schedule?.work_days ||
    (barber as any)?.schedule?.workingDaysArray ||
    (barber as any)?.working_days;

  const rawWorkingDaysText =
    barber?.workingDaysText ||
    barber?.workingDays ||
    barber?.schedule?.workingDays ||
    (barber as any)?.schedule?.working_days_text ||
    'Lunes a Sábado';

  const workingDaysList = normalizeWorkingDaysToNumbers(rawWorkingDays, String(rawWorkingDaysText));

  // Prioridad estricta de Días de Descanso sobre Excepciones de Horario:
  // Validar PRIMERO si el día de la semana está activo en "Días Laborales".
  // Si el día está desmarcado como descanso, mostrar siempre "Día de Descanso Programado" y bloquear reservas,
  // incluso si existe una "Excepción Activa" creada previamente para esa fecha puntual.
  if (!workingDaysList.includes(dayOfWeek)) {
    return [];
  }

  // Requisito 3: Soporte para Horario Especial por Día Específico o Fecha Puntual (solo aplicable si el día de la semana es un día laboral activo)
  let specialSchedules: any[] =
    barber?.workingHours?.specialDaySchedules ||
    (barber?.schedule as any)?.exceptions ||
    (barber?.schedule as any)?.special_hours ||
    (barber as any)?.specialDaySchedules ||
    (barber as any)?.special_day_schedules ||
    [];

  if (specialSchedules.length === 0 && typeof window !== 'undefined') {
    try {
      const stored =
        localStorage.getItem(`barbersync_avail_settings_${barber.id}`) ||
        (barber.userId ? localStorage.getItem(`barbersync_avail_settings_${barber.userId}`) : null);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.workingHours?.specialDaySchedules) {
          specialSchedules = parsed.workingHours.specialDaySchedules;
        }
      }
    } catch {}
  }

  const specialForToday = specialSchedules.find((s) => {
    if (!s) return false;
    const sDate = (s.date || '').trim();
    if (sDate && sDate === targetDateKey) return true;
    if (s.dayOfWeek !== undefined && Number(s.dayOfWeek) === dayOfWeek) return true;
    return false;
  });

  const isSpecialClosed = Boolean(
    specialForToday && (
      specialForToday.isClosed ||
      specialForToday.isRestDay ||
      specialForToday.start === specialForToday.end ||
      specialForToday.label === 'Día de Descanso'
    )
  );

  if (isSpecialClosed) {
    return [];
  }

  const workingHours = barber?.workingHours || {
    start: '09:00',
    end: '20:00',
    slotDurationMinutes: 30,
    lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
    workingDays: [1, 2, 3, 4, 5, 6],
  };

  const slotDurationMinutes = workingHours.slotDurationMinutes || 30;
  const lunchBreak = workingHours.lunchBreak || { enabled: true, start: '14:00', end: '15:00' };

  // Prioridad estricta al Horario Especial si existe para este día/fecha
  const rawStart = normalizeTimeTo24h(
    specialForToday?.start || workingHours.start || barber?.openTime || (barber?.schedule as any)?.openTime || '09:00',
    '09:00'
  );
  const rawEnd = normalizeTimeTo24h(
    specialForToday?.end || workingHours.end || barber?.closeTime || (barber?.schedule as any)?.closeTime || '20:00',
    '20:00'
  );

  // Regla crítica: El rango operativo para generar bloques LIBRES es estrictamente el del día (o de la excepción).
  // NUNCA generar casillas como 'available' antes de startMins ni después de endMins.
  // Cualquier cita existente previa fuera de este rango se preserva automáticamente como 'booked' más abajo.
  const startMins = timeToMinutes(rawStart);
  const endMins = timeToMinutes(rawEnd);

  const lunchStartMins = lunchBreak.enabled ? timeToMinutes(normalizeTimeTo24h(lunchBreak.start || '14:00', '14:00')) : -1;
  const lunchEndMins = lunchBreak.enabled ? timeToMinutes(normalizeTimeTo24h(lunchBreak.end || '15:00', '15:00')) : -1;

  // Current time check for today
  const now = new Date();
  const isToday =
    targetDate.getFullYear() === now.getFullYear() &&
    targetDate.getMonth() === now.getMonth() &&
    targetDate.getDate() === now.getDate();
  const currentMinutesNow = now.getHours() * 60 + now.getMinutes();

  // Filter relevant blocked slots matching barber ID, user ID, or clean ID
  const dayBlocked = (blockedSlots || []).filter((b) => {
    if (!b) return false;
    const bDate = (b.date || (b as any).block_date || '').trim();
    if (bDate !== targetDateKey) return false;
    const bBarberId = (b.barberId || (b as any).barber_id || '').trim();
    const cleanBId = bBarberId.replace(/^b-/, '').toLowerCase();
    return (
      bBarberId === barber.id ||
      cleanBId === cleanBarberId ||
      (Boolean(barber.userId) && (bBarberId === barber.userId || cleanBId === (barber.userId || '').replace(/^b-/, '').toLowerCase())) ||
      (bBarberId && barber.id && bBarberId.endsWith(barber.id))
    );
  });

  const slots: TimeSlotStatus[] = [];

  for (let m = startMins; m + slotDurationMinutes <= endMins; m += slotDurationMinutes) {
    const timeStr = minutesToTime(m);
    const normalizedSlotTime = normalizeTime(timeStr);

    // 1. Check if booked with an active appointment (booked has visual priority over blocks)
    // Cross-match using strict time normalization (ej. "09:00 AM", "9:00 a.m.", "09:00", "9:00 am")
    const bookedApt = dayAppointments.find((a) => {
      const aptRaw = a.time || (a as any).appointment_time || (a as any).appointmentTime;
      if (!aptRaw) return false;
      const aptNorm = normalizeTime(aptRaw);
      const apt24h = normalizeTimeTo24h(aptRaw);
      return (
        aptNorm === normalizedSlotTime ||
        apt24h === timeStr ||
        aptRaw === timeStr ||
        aptRaw === normalizedSlotTime
      );
    });

    if (bookedApt) {
      slots.push({
        time: timeStr,
        status: 'booked',
        appointment: bookedApt,
      });
      continue;
    }

    // 2. Check lunch break (unless an unblock exception exists for this date and time)
    if (lunchBreak.enabled && m >= lunchStartMins && m < lunchEndMins) {
      const isUnblocked = exceptions.some(
        (e: { barberId: string; date: string; time: string }) =>
          (e.barberId === barber.id || (barber.userId && e.barberId === barber.userId)) &&
          e.date === dateString &&
          (e.time === timeStr || normalizeTime(e.time) === normalizedSlotTime)
      );

      if (!isUnblocked) {
        slots.push({
          time: timeStr,
          status: 'blocked',
          reason: 'Descanso de Almuerzo',
          isLunchBreak: true,
        });
        continue;
      }
    }

    // 3. Check if explicitly blocked by barber with strict time normalization ("08:30 am" vs "8:30 am" vs "08:30")
    const manualBlock = dayBlocked.find((b) => {
      const bTime = (b.time || '').trim();
      if (!bTime) return false;
      const bNorm = normalizeTime(bTime);
      const b24h = normalizeTimeTo24h(bTime);
      return (
        bTime === timeStr ||
        b24h === timeStr ||
        bNorm === normalizedSlotTime ||
        bTime === normalizedSlotTime
      );
    });
    if (manualBlock) {
      const scheduleReasons = (barber?.schedule as any)?.blocked_reasons || {};
      const reasonKey1 = `${targetDateKey}_${manualBlock.time}`;
      const reasonKey2 = `${targetDateKey}_${timeStr}`;
      const reasonKey3 = `${targetDateKey}_${formatTimeTo12h(timeStr)}`;
      const backupReason = scheduleReasons[reasonKey1] || scheduleReasons[reasonKey2] || scheduleReasons[reasonKey3];
      const finalReason =
        (manualBlock.reason && manualBlock.reason !== 'Bloqueado' && manualBlock.reason !== 'Horario Bloqueado')
          ? manualBlock.reason
          : (backupReason || manualBlock.reason || 'Horario Bloqueado');

      slots.push({
        time: timeStr,
        status: 'blocked',
        blockedSlot: {
          ...manualBlock,
          reason: finalReason,
        },
        reason: finalReason,
      });
      continue;
    }

    // 4. Check if past time today
    if (isToday && m < currentMinutesNow) {
      slots.push({
        time: timeStr,
        status: 'past',
        reason: 'Horario pasado',
      });
      continue;
    }

    // 5. Otherwise available
    slots.push({
      time: timeStr,
      status: 'available',
    });
  }

  // Garantía absoluta: Asegurar que TODA cita existente en dayAppointments esté presente en slots
  dayAppointments.forEach((apt) => {
    const aptRaw = apt.time || (apt as any).appointment_time || (apt as any).appointmentTime || '';
    const apt24h = normalizeTimeTo24h(aptRaw);
    const exists = slots.some(
      (s) => s.appointment?.id === apt.id || s.time === apt24h
    );
    if (!exists) {
      slots.push({
        time: apt24h,
        status: 'booked',
        appointment: apt,
      });
    }
  });

  // Ordenar cronológicamente
  slots.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  return slots;
}

export function formatPhoneForWhatsApp(phone?: string, defaultCountryPrefix: string = '57'): string {
  if (!phone || phone === 'Presencial') return '';
  let clean = phone.replace(/\D/g, '');
  if (!clean) return '';
  // If user entered 10 digits without country prefix (e.g. 3001234567 in Colombia):
  if (clean.length === 10 && !clean.startsWith('57') && !clean.startsWith('52') && !clean.startsWith('54') && !clean.startsWith('56') && !clean.startsWith('58')) {
    clean = `${defaultCountryPrefix}${clean}`;
  }
  return clean;
}

export function generateWhatsAppLink(appointment: Appointment, barbershopName?: string): string {
  const cleanPhone = formatPhoneForWhatsApp(appointment.clientPhone);
  
  let savedShop = '';
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('barbersync_saved_profile');
      if (raw) {
        const p = JSON.parse(raw);
        savedShop = p.barbershopName || p.business_name || p.shop_name || '';
      }
    } catch {}
  }

  const rawShop =
    barbershopName ||
    (appointment as any).business_name ||
    (appointment as any).barber_business_name ||
    (appointment as any).barbershopName ||
    (appointment as any).shop_name ||
    savedShop ||
    'LA BARBERÍA';

  const shopName = String(rawShop).trim().toUpperCase();
  const time12 = formatTimeTo12h(appointment.time);
  const dateFormatted = formatDateLabel(appointment.date);

  const message = encodeURIComponent(
    `¡Hola ${appointment.clientName}! Te confirmamos tu turno en ${shopName}:\n\n` +
      `💈 *Barbero:* ${appointment.barberName}\n` +
      `✂️ *Servicio:* ${appointment.serviceName}\n` +
      `📅 *Fecha:* ${dateFormatted} a las ${time12}\n` +
      `🏷️ *Código:* ${appointment.code}\n` +
      `💰 *Total:* ${formatCurrency(Number((appointment as any).price ?? (appointment as any).service_price ?? appointment.servicePrice ?? 0))}\n\n` +
      `¡Te esperamos en la Barbería!`
  );
  return `https://wa.me/${cleanPhone}?text=${message}`;
}

export function generateGoogleCalendarUrl(appointment: Appointment, barber?: Barber): string {
  try {
    const cleanDate = (appointment.date || '').split('T')[0].trim();
    const [year, month, day] = cleanDate.split('-').map(Number);
    const norm24 = normalizeTimeTo24h(appointment.time, '09:00');
    const [hours, mins] = norm24.split(':').map(Number);
    const durationMins = Number(appointment.serviceDuration || (appointment as any).duration_minutes || 30);

    const pad = (n: number) => String(n).padStart(2, '0');
    // Generar formato ISO compacto YYYYMMDDTHHMMSS
    const startStr = `${year}${pad(month)}${pad(day)}T${pad(hours)}${pad(mins)}00`;
    const endMinutesTotal = hours * 60 + mins + durationMins;
    const endH = Math.floor(endMinutesTotal / 60) % 24;
    const endM = endMinutesTotal % 60;
    const endStr = `${year}${pad(month)}${pad(day)}T${pad(endH)}${pad(endM)}00`;

    const shopName = barber?.business_name || barber?.businessName || barber?.barbershopName || (appointment as any).shop_name || 'BarberAdes';
    const title = encodeURIComponent(`Turno en ${shopName}: ${appointment.serviceName}`);
    const details = encodeURIComponent(
      `Turno confirmado con ${appointment.barberName}.\nServicio: ${appointment.serviceName}\nCódigo de reserva: ${appointment.code}\n¡Te esperamos en la Barbería!`
    );
    const location = encodeURIComponent(barber?.address || 'Barbería');

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}&location=${location}`;
  } catch {
    return 'https://calendar.google.com/';
  }
}

export function downloadIcsCalendar(appointment: Appointment, barber?: Barber): void {
  try {
    const cleanDate = (appointment.date || '').split('T')[0].trim();
    const [year, month, day] = cleanDate.split('-').map(Number);
    const norm24 = normalizeTimeTo24h(appointment.time, '09:00');
    const [hours, mins] = norm24.split(':').map(Number);

    const durationMins = Number(appointment.serviceDuration || (appointment as any).duration_minutes || 30);
    const startDate = new Date(year, month - 1, day, hours, mins, 0);
    const endDate = new Date(startDate.getTime() + durationMins * 60 * 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const formatIcsLocal = (d: Date) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

    const shopName = barber?.business_name || barber?.businessName || barber?.barbershopName || (appointment as any).shop_name || 'BarberAdes';
    const location = barber?.address || 'Barbería';
    const summary = `Turno en ${shopName}: ${appointment.serviceName}`;
    const description = `Turno con ${appointment.barberName}. Código de reserva: ${appointment.code}. Total: ${formatCurrency(Number((appointment as any).price ?? (appointment as any).service_price ?? appointment.servicePrice ?? 0))}.`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//BarberAdes//Turnos Barbershop//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${appointment.id || Date.now()}@barberades.app`,
      `DTSTAMP:${formatIcsLocal(new Date())}Z`,
      `DTSTART:${formatIcsLocal(startDate)}`,
      `DTEND:${formatIcsLocal(endDate)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `turno-${(appointment.code || 'reserva').replace('#', '')}.ics`);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 250);
  } catch (err) {
    console.error('Error generating .ics calendar file, opening Google Calendar fallback:', err);
    if (typeof window !== 'undefined') {
      const gUrl = generateGoogleCalendarUrl(appointment, barber);
      window.open(gUrl, '_blank');
    }
  }
}

/**
 * Inhabilita el rango bidireccional [-6 días, +6 días] por cada cita activa previa del cliente.
 * Si el cliente tiene cita en la fecha D, las fechas [D - 6, ..., D, ..., D + 6]
 * quedan estrictamente inhabilitadas, y la próxima fecha habilitada es D + 7 días.
 * Esto impide que el cliente reserve turnos consecutivos tanto antes como después de su cita.
 */
export function getFrequencyRestrictedDates(
  appointments: Appointment[],
  clientId?: string,
  clientEmail?: string,
  clientPhone?: string
): {
  restrictedDates: Set<string>;
  earliestAllowedDateByDate: Map<string, string>;
  latestNextAllowedDate?: string;
  hasActiveRestrictions: boolean;
} {
  const restrictedDates = new Set<string>();
  const earliestAllowedDateByDate = new Map<string, string>();
  let latestNextAllowedDate: string | undefined;

  const cleanEmail = clientEmail?.trim().toLowerCase();
  const cleanId = clientId?.trim();
  const cleanPhone = clientPhone?.trim();

  if (!appointments || appointments.length === 0 || (!cleanId && !cleanEmail && !cleanPhone)) {
    return { restrictedDates, earliestAllowedDateByDate, latestNextAllowedDate, hasActiveRestrictions: false };
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  appointments.forEach((apt) => {
    const isClientAppointment =
      Boolean(cleanId && (apt.clientId === cleanId || (apt as any).client_id === cleanId)) ||
      Boolean(cleanEmail && ((apt.clientEmail && apt.clientEmail.toLowerCase() === cleanEmail) || ((apt as any).client_email && (apt as any).client_email.toLowerCase() === cleanEmail))) ||
      Boolean(cleanPhone && (apt.clientPhone === cleanPhone || (apt as any).client_phone === cleanPhone));

    const isActive = apt.status === 'confirmed' || apt.status === 'in_progress' || (apt.status as string) === 'pending';
    if (!isClientAppointment || !isActive || !apt.date) return;

    const [y, m, d] = apt.date.split('-').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return;

    // Próxima fecha habilitada posterior al bloque: D + 7 días
    const nextAllowedObj = new Date(y, m - 1, d + 7, 12, 0, 0);
    const nextAllowedStr = `${nextAllowedObj.getFullYear()}-${String(nextAllowedObj.getMonth() + 1).padStart(2, '0')}-${String(nextAllowedObj.getDate()).padStart(2, '0')}`;

    if (nextAllowedStr > todayStr) {
      if (!latestNextAllowedDate || nextAllowedStr > latestNextAllowedDate) {
        latestNextAllowedDate = nextAllowedStr;
      }
    }

    // Inhabilitar rango simétrico: [D - 6 días] hasta [D + 6 días]
    for (let offset = -6; offset <= 6; offset++) {
      const cur = new Date(y, m - 1, d + offset, 12, 0, 0);
      const curStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      restrictedDates.add(curStr);

      const prev = earliestAllowedDateByDate.get(curStr);
      if (!prev || nextAllowedStr > prev) {
        earliestAllowedDateByDate.set(curStr, nextAllowedStr);
      }
    }
  });

  return {
    restrictedDates,
    earliestAllowedDateByDate,
    latestNextAllowedDate,
    hasActiveRestrictions: restrictedDates.size > 0,
  };
}

/**
 * Regla de cancelación del cliente: solo permitida si falta más de 1 hora (60 min) para el turno.
 */
export function isAppointmentCancellableByClient(
  dateString: string,
  timeString: string
): { canCancel: boolean; minutesRemaining: number; reason?: string } {
  try {
    const cleanDate = (dateString || '').trim();
    if (!cleanDate) {
      return { canCancel: false, minutesRemaining: 0, reason: 'Fecha no válida' };
    }

    const norm24 = normalizeTimeTo24h(timeString, '00:00');
    const [hStr, mStr] = norm24.split(':');
    const h = parseInt(hStr || '0', 10);
    const m = parseInt(mStr || '0', 10);

    const [y, mon, d] = cleanDate.split('-').map(Number);
    if (!y || !mon || !d) {
      return { canCancel: false, minutesRemaining: 0, reason: 'Formato de fecha no válido' };
    }

    const aptDateTime = new Date(y, mon - 1, d, h, m, 0);
    const now = new Date();
    const diffMs = aptDateTime.getTime() - now.getTime();
    const minutesRemaining = Math.floor(diffMs / 60000);

    if (minutesRemaining <= 60) {
      return {
        canCancel: false,
        minutesRemaining,
        reason: 'Las cancelaciones solo están permitidas hasta 1 hora antes del turno.',
      };
    }

    return { canCancel: true, minutesRemaining };
  } catch {
    return { canCancel: false, minutesRemaining: 0, reason: 'Error calculando tiempo' };
  }
}

/**
 * Determina si la hora de una cita ya inició o pasó
 */
export function hasAppointmentStarted(dateString: string, timeString: string): boolean {
  try {
    const cleanDate = (dateString || '').trim();
    if (!cleanDate) return false;

    const norm24 = normalizeTimeTo24h(timeString, '00:00');
    const [hStr, mStr] = norm24.split(':');
    const h = parseInt(hStr || '0', 10);
    const m = parseInt(mStr || '0', 10);

    const [y, mon, d] = cleanDate.split('-').map(Number);
    if (!y || !mon || !d) return false;

    const aptDateTime = new Date(y, mon - 1, d, h, m, 0);
    return Date.now() >= aptDateTime.getTime();
  } catch {
    return false;
  }
}

