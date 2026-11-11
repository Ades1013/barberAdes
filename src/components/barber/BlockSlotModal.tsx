import React, { useState, useEffect, useMemo } from 'react';
import { X, Ban, Clock, Calendar, AlertCircle, ChevronLeft, ChevronRight, CheckCircle2, ArrowRight } from 'lucide-react';
import { Barber, BlockedSlot, Appointment } from '../../types';
import { storageService } from '../../services/storageService';
import { realtimeService } from '../../services/realtimeService';
import { formatDateLabel, formatTimeTo12h, normalizeTime, normalizeTimeTo24h } from '../../utils/dateUtils';
import { TimePickerModal } from '../common/TimePickerModal';

interface BlockSlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  barber: Barber;
  date: string;
  defaultTime?: string;
  appointments?: Appointment[];
  onSlotBlocked: (newSlots?: BlockedSlot[]) => void;
}

const COMMON_REASONS = [
  'Descanso / Almuerzo',
  'Trámite o Turno Médico',
  'Mantenimiento y Afilado de Navajas',
  'Pausa Personal',
  'Capacitación / Masterclass',
];

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAY_HEADERS_ES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

export const BlockSlotModal: React.FC<BlockSlotModalProps> = ({
  isOpen,
  onClose,
  barber,
  date,
  defaultTime = '13:30',
  appointments,
  onSlotBlocked,
}) => {
  // Month navigation for visual calendar
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, [today]);

  const currentTime24 = useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  // Fecha seleccionable interactiva
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (date && date >= todayStr) return date;
    return todayStr;
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Restricción: Mes actual y mes próximo
  const currentMonthIndex = today.getMonth();
  const currentYear = today.getFullYear();
  const nextMonthIndex = (currentMonthIndex + 1) % 12;
  const nextMonthYear = currentMonthIndex === 11 ? currentYear + 1 : currentYear;

  const maxDateStr = useMemo(() => {
    const lastDayNextMonth = new Date(nextMonthYear, nextMonthIndex + 1, 0);
    const y = lastDayNextMonth.getFullYear();
    const m = String(lastDayNextMonth.getMonth() + 1).padStart(2, '0');
    const day = String(lastDayNextMonth.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, [nextMonthIndex, nextMonthYear]);

  const [calendarMonthOffset, setCalendarMonthOffset] = useState<0 | 1>(0);
  const displayedYear = calendarMonthOffset === 0 ? currentYear : nextMonthYear;
  const displayedMonth = calendarMonthOffset === 0 ? currentMonthIndex : nextMonthIndex;

  // Helper: Obtener rango horario hábil configurado del barbero para la fecha (working_hours)
  const getWorkingBoundsForDate = (targetDate: string) => {
    const wh = barber?.workingHours || (barber as any)?.working_hours || {};
    const specialList: any[] = [
      ...(Array.isArray(wh.specialDaySchedules) ? wh.specialDaySchedules : []),
      ...(Array.isArray((barber?.schedule as any)?.exceptions) ? (barber.schedule as any).exceptions : []),
      ...(Array.isArray((barber?.schedule as any)?.special_hours) ? (barber.schedule as any).special_hours : []),
    ];
    let specialForDate: any = null;
    if (targetDate) {
      const [y, m, d] = targetDate.split('-').map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      specialForDate =
        specialList.find((s: any) => s && s.date === targetDate) ||
        specialList.find((s: any) => s && !s.date && Number(s.dayOfWeek) === dayOfWeek);
    }
    const open24 = normalizeTimeTo24h(
      specialForDate?.start || wh.start || barber?.openTime || (barber?.schedule as any)?.openTime || '09:00',
      '09:00'
    );
    const close24 = normalizeTimeTo24h(
      specialForDate?.end || wh.end || barber?.closeTime || (barber?.schedule as any)?.closeTime || '20:00',
      '20:00'
    );
    const [oh, om] = open24.split(':').map(Number);
    const [ch, cm] = close24.split(':').map(Number);
    const openMins = (oh || 0) * 60 + (om || 0);
    const closeMins = (ch || 0) * 60 + (cm || 0);
    const lastStartMins = Math.max(openMins, closeMins - 30);
    const lsh = Math.floor(lastStartMins / 60);
    const lsm = lastStartMins % 60;
    const lastStart24 = `${String(lsh).padStart(2, '0')}:${String(lsm).padStart(2, '0')}`;
    return {
      open24,
      close24,
      lastStart24,
      openMins,
      closeMins,
      lastStartMins,
    };
  };

  const currentBounds = useMemo(() => getWorkingBoundsForDate(selectedDate || date || todayStr), [barber, selectedDate, date, todayStr]);

  const effectiveMinStart24 = useMemo(() => {
    if (selectedDate === todayStr) {
      const [ch, cm] = currentTime24.split(':').map(Number);
      const curM = (ch || 0) * 60 + (cm || 0);
      if (curM > currentBounds.openMins) {
        return currentTime24;
      }
    }
    return currentBounds.open24;
  }, [selectedDate, todayStr, currentTime24, currentBounds]);

  const add30Minutes = (timeStr: string, maxCloseMins = 23 * 60 + 59): string => {
    const norm = normalizeTimeTo24h(timeStr || '10:00', '10:00');
    const [h, m] = norm.split(':').map(Number);
    const total = (h || 0) * 60 + (m || 0) + 30;
    const bounded = Math.min(total, maxCloseMins);
    const endH = Math.floor(bounded / 60);
    const endM = bounded % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  // Punto 2: Hora Inicio y Hora Fin estrictamente dentro de working_hours
  const [startTime, setStartTime] = useState<string>(() => {
    const b = getWorkingBoundsForDate(date || todayStr);
    const candidate = defaultTime && defaultTime !== '13:30' ? normalizeTimeTo24h(defaultTime, b.open24) : b.open24;
    const [h, m] = candidate.split(':').map(Number);
    const clamped = Math.max(b.openMins, Math.min((h || 0) * 60 + (m || 0), b.lastStartMins));
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
  });

  const [endTime, setEndTime] = useState<string>(() => {
    const b = getWorkingBoundsForDate(date || todayStr);
    const candidate = defaultTime && defaultTime !== '13:30' ? normalizeTimeTo24h(defaultTime, b.open24) : b.open24;
    const [h, m] = candidate.split(':').map(Number);
    const clampedStart = Math.max(b.openMins, Math.min((h || 0) * 60 + (m || 0), b.lastStartMins));
    const start24 = `${String(Math.floor(clampedStart / 60)).padStart(2, '0')}:${String(clampedStart % 60).padStart(2, '0')}`;
    return add30Minutes(start24, b.closeMins);
  });

  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);
  const [reason, setReason] = useState(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (date) {
      setSelectedDate(date < todayStr ? todayStr : date);
    }
  }, [date, todayStr]);

  // Al abrir el modal o cambiar de día/defaultTime: asegurar que inicio y fin estén dentro del horario de atención
  useEffect(() => {
    if (!isOpen) return;
    const b = getWorkingBoundsForDate(selectedDate || date || todayStr);
    const rawStart = defaultTime && defaultTime !== '13:30'
      ? normalizeTimeTo24h(defaultTime, b.open24)
      : b.open24;
    const [sh, sm] = rawStart.split(':').map(Number);
    let startM = (sh || 0) * 60 + (sm || 0);
    if ((selectedDate || date || todayStr) === todayStr) {
      const n = new Date();
      const curM = n.getHours() * 60 + n.getMinutes();
      if (startM < curM) startM = Math.ceil(curM / 30) * 30;
    }
    const clampedStart = Math.max(b.openMins, Math.min(startM, b.lastStartMins));
    const initialStart = `${String(Math.floor(clampedStart / 60)).padStart(2, '0')}:${String(clampedStart % 60).padStart(2, '0')}`;
    setStartTime(initialStart);
    setEndTime(add30Minutes(initialStart, b.closeMins));
    setErrorMessage(null);
  }, [isOpen, defaultTime, selectedDate]);

  // Soporte global de tecla Escape (Esc)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activePicker) {
        setActivePicker(null);
        return;
      }
      if (isDatePickerOpen) {
        setIsDatePickerOpen(false);
        return;
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activePicker, isDatePickerOpen, onClose]);

  // Cálculo automático de intervalos de 30 minutos comprendidos en el rango
  const computedSlots = useMemo(() => {
    const [startH, startM] = (startTime || '13:00').split(':').map(Number);
    const [endH, endM] = (endTime || '14:00').split(':').map(Number);
    const startTotal = (startH || 0) * 60 + (startM || 0);
    const endTotal = (endH || 0) * 60 + (endM || 0);

    if (endTotal <= startTotal) return [];

    const slotsList: Array<{ time24: string; time12: string }> = [];
    for (let m = startTotal; m < endTotal; m += 30) {
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      const t24 = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      slotsList.push({
        time24: t24,
        time12: formatTimeTo12h(t24),
      });
    }
    return slotsList;
  }, [startTime, endTime]);

  // Generar cuadrícula de días para el mes visualizado
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();
    const firstDayIndex = (new Date(displayedYear, displayedMonth, 1).getDay() + 6) % 7;

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isDisabled: boolean;
      isSelected: boolean;
      isToday: boolean;
    } | null> = [];

    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isDisabled = dStr < todayStr || dStr > maxDateStr;
      const isSelected = dStr === selectedDate;
      const isToday = dStr === todayStr;

      days.push({
        dateStr: dStr,
        dayNum: d,
        isDisabled,
        isSelected,
        isToday,
      });
    }

    return days;
  }, [displayedYear, displayedMonth, todayStr, maxDateStr, selectedDate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (computedSlots.length === 0) {
      setErrorMessage('La hora de fin debe ser posterior a la hora de inicio (al menos 30 minutos de diferencia).');
      return;
    }

    const nowCurrent = new Date();
    const currentMins = nowCurrent.getHours() * 60 + nowCurrent.getMinutes();
    const [h, m] = (startTime || '00:00').split(':').map(Number);
    const selectedSlotMins = (h || 0) * 60 + (m || 0);

    if (selectedDate < todayStr || (selectedDate === todayStr && selectedSlotMins < currentMins)) {
      setErrorMessage('No puedes bloquear un horario en una fecha u hora que ya pasó.');
      return;
    }

    const [eh, em] = (endTime || '00:00').split(':').map(Number);
    const selectedEndMins = (eh || 0) * 60 + (em || 0);
    if (selectedSlotMins < currentBounds.openMins || selectedEndMins > currentBounds.closeMins) {
      setErrorMessage(
        `El rango a bloquear debe estar dentro del horario de atención del local (${formatTimeTo12h(currentBounds.open24)} - ${formatTimeTo12h(currentBounds.close24)}).`
      );
      return;
    }

    // Verificar si ya existe una cita activa en alguno de los turnos a bloquear
    const allAppointments = appointments || storageService.getCachedAppointments();
    const conflict = allAppointments.find((a) => {
      const isSameDate = a.date === selectedDate || (a as any).appointment_date === selectedDate;
      if (!isSameDate || a.status === 'cancelled') return false;

      const cleanBarberId = (barber.id || '').replace(/^b-/, '').toLowerCase();
      const aptBarberId = (a.barberId || (a as any).barber_id || '').replace(/^b-/, '').toLowerCase();
      const isSameBarber = aptBarberId === cleanBarberId || (barber.userId && aptBarberId === barber.userId.replace(/^b-/, '').toLowerCase());
      if (!isSameBarber) return false;

      const aptTimeNorm = normalizeTime(a.time || (a as any).appointment_time || '');
      return computedSlots.some((s) => s.time12 === aptTimeNorm || s.time24 === a.time || normalizeTime(s.time12) === aptTimeNorm);
    });

    if (conflict) {
      setErrorMessage(
        `No se puede bloquear el rango: ya existe una cita agendada para ${conflict.clientName} a las ${conflict.time}. Cancela o reprograma la cita primero.`
      );
      return;
    }

    const finalReason = customReason.trim() || reason;

    // Crear arreglo de nuevos slots bloqueados con UUID válido y tiempo estandarizado
    const newBlockedSlots: BlockedSlot[] = computedSlots.map((s) => ({
      id: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, '0')}`),
      barberId: barber.id,
      date: selectedDate,
      time: s.time12, // formato estándar ej. "01:30 pm"
      reason: finalReason,
      createdAt: new Date().toISOString(),
    }));

    // Limpiar excepciones previas
    computedSlots.forEach((s) => {
      storageService.removeUnblockedException(barber.id, selectedDate, s.time24);
      storageService.removeUnblockedException(barber.id, selectedDate, s.time12);
    });

    // Inserción en lote en Supabase + guardado local sincrónico
    await storageService.addBlockedSlots(newBlockedSlots);

    // Emisión en tiempo real
    realtimeService.emit({
      type: 'BLOCK_SLOT',
      actor: 'barber',
      payload: newBlockedSlots,
      message: `${newBlockedSlots.length} horarios bloqueados`,
    });

    onSlotBlocked(newBlockedSlots);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#12151b] border border-amber-500/30 rounded-2xl p-6 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
            <Ban className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Bloquear Horarios por Rango</h2>
            <p className="text-xs text-slate-400">
              Deshabilita un intervalo completo de turnos para que no puedan ser reservados.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in duration-200 shadow-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Selector de Fecha Interactivo */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Fecha a Bloquear
            </label>
            <div
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className="relative cursor-pointer group"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsDatePickerOpen(!isDatePickerOpen);
                }
              }}
            >
              <Calendar className="w-4 h-4 text-amber-400 group-hover:text-amber-300 transition-colors absolute left-3.5 top-1/2 -translate-y-1/2 cursor-pointer" />
              <div className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 group-hover:border-amber-500/80 rounded-xl text-xs sm:text-sm text-white transition-colors flex items-center justify-between shadow-xs">
                <span className="font-semibold text-white tracking-wide">
                  {formatDateLabel(selectedDate)}
                </span>
                <span className="text-[11px] text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                  {isDatePickerOpen ? 'Cerrar' : 'Elegir Fecha'}
                </span>
              </div>
            </div>

            {/* Calendario Desplegable */}
            {isDatePickerOpen && (
              <div className="mt-2 p-3 bg-slate-950 border border-amber-500/40 rounded-xl shadow-2xl animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
                  <button
                    type="button"
                    disabled={calendarMonthOffset === 0}
                    onClick={() => setCalendarMonthOffset(0)}
                    className={`p-1.5 rounded-lg border transition-all ${
                      calendarMonthOffset === 0
                        ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer'
                    }`}
                    aria-label="Mes anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="text-xs font-bold text-white tracking-wide capitalize">
                    {MONTH_NAMES_ES[displayedMonth]} {displayedYear}
                  </span>

                  <button
                    type="button"
                    disabled={calendarMonthOffset === 1}
                    onClick={() => setCalendarMonthOffset(1)}
                    className={`p-1.5 rounded-lg border transition-all ${
                      calendarMonthOffset === 1
                        ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer'
                    }`}
                    aria-label="Mes siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center mb-1">
                  {DAY_HEADERS_ES.map((h, i) => (
                    <span key={i} className="text-[10px] font-semibold text-slate-400">
                      {h}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
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
                          setErrorMessage(null);
                          setIsDatePickerOpen(false);
                        }}
                        className={`h-7 w-full rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                            : isDisabled
                            ? 'text-slate-600 cursor-not-allowed bg-transparent'
                            : isToday
                            ? 'bg-slate-800 text-amber-300 border border-amber-500/50 hover:bg-amber-500/20 cursor-pointer'
                            : 'bg-slate-900/60 text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer'
                        }`}
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-900 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Válido hoy y mes próximo</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(todayStr);
                      setCalendarMonthOffset(0);
                      setIsDatePickerOpen(false);
                    }}
                    className="text-amber-400 hover:underline font-semibold cursor-pointer"
                  >
                    Hoy
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Punto 2: Selector Dual: Hora Inicio y Hora Fin */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Hora Inicio</span>
                <span className="text-[10px] text-amber-400/80 font-normal">Comienzo</span>
              </label>
              <div
                onClick={() => setActivePicker('start')}
                className="relative cursor-pointer group"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActivePicker('start');
                  }
                }}
              >
                <Clock className="w-4 h-4 text-amber-400 group-hover:text-amber-300 transition-colors absolute left-3.5 top-1/2 -translate-y-1/2 cursor-pointer" />
                <div className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 group-hover:border-amber-500/80 rounded-xl text-sm text-white transition-colors flex items-center justify-between shadow-xs">
                  <span className="font-semibold text-white tracking-wide">{formatTimeTo12h(startTime)}</span>
                  <span className="text-xs text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    Elegir
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Hora Fin</span>
                <span className="text-[10px] text-amber-400/80 font-normal">Término</span>
              </label>
              <div
                onClick={() => setActivePicker('end')}
                className="relative cursor-pointer group"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActivePicker('end');
                  }
                }}
              >
                <Clock className="w-4 h-4 text-amber-400 group-hover:text-amber-300 transition-colors absolute left-3.5 top-1/2 -translate-y-1/2 cursor-pointer" />
                <div className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 group-hover:border-amber-500/80 rounded-xl text-sm text-white transition-colors flex items-center justify-between shadow-xs">
                  <span className="font-semibold text-white tracking-wide">{formatTimeTo12h(endTime)}</span>
                  <span className="text-xs text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    Elegir
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Vista previa o resumen claro de los turnos que serán bloqueados */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {computedSlots.length === 1
                    ? '1 turno a bloquear'
                    : `${computedSlots.length} turnos a bloquear`}
                </span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {formatTimeTo12h(startTime)} <ArrowRight className="inline w-3 h-3 text-amber-400" /> {formatTimeTo12h(endTime)}
              </span>
            </div>

            {computedSlots.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {computedSlots.map((s) => (
                  <span
                    key={s.time24}
                    className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono font-semibold text-[11px]"
                  >
                    {s.time12}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-rose-400 font-medium">
                La hora de fin debe ser mayor a la hora de inicio (al menos 30 minutos de diferencia).
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Motivo del Bloqueo
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition-colors mb-2 shadow-xs cursor-pointer"
            >
              {COMMON_REASONS.map((r) => (
                <option key={r} value={r} className="bg-slate-900 text-white">
                  {r}
                </option>
              ))}
              <option value="Otro" className="bg-slate-900 text-white">Otro motivo personalizado...</option>
            </select>

            {reason === 'Otro' && (
              <input
                type="text"
                placeholder="Escribe el motivo..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors shadow-xs"
              />
            )}
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-2.5 px-3 rounded-xl text-xs font-semibold border border-slate-800 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shadow-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={computedSlots.length === 0}
              className={`w-1/2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all shadow-md ${
                computedSlots.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
              }`}
            >
              {computedSlots.length > 0 ? `Bloquear ${computedSlots.length} Turnos` : 'Bloquear Horario'}
            </button>
          </div>
        </form>
      </div>

      {/* Time Picker Modal para Hora Inicio */}
      <TimePickerModal
        isOpen={activePicker === 'start'}
        onClose={() => setActivePicker(null)}
        value={startTime}
        onChange={(newTime) => {
          setStartTime(newTime);
          setErrorMessage(null);
          // Si endTime queda menor o igual a newTime, ajustarlo dentro del horario de cierre
          const [nh, nm] = newTime.split(':').map(Number);
          const [eh, em] = endTime.split(':').map(Number);
          const newStartM = (nh || 0) * 60 + (nm || 0);
          const currentEndM = (eh || 0) * 60 + (em || 0);
          if (currentEndM <= newStartM || currentEndM > currentBounds.closeMins) {
            const bumped = Math.min(newStartM + 30, currentBounds.closeMins);
            const bH = Math.floor(bumped / 60);
            const bM = bumped % 60;
            setEndTime(`${String(bH).padStart(2, '0')}:${String(bM).padStart(2, '0')}`);
          }
        }}
        title="Hora Inicio del Bloqueo"
        minTime={effectiveMinStart24}
        maxTime={currentBounds.lastStart24}
      />

      {/* Time Picker Modal para Hora Fin */}
      <TimePickerModal
        isOpen={activePicker === 'end'}
        onClose={() => setActivePicker(null)}
        value={endTime}
        onChange={(newTime) => {
          setEndTime(newTime);
          setErrorMessage(null);
        }}
        title="Hora Fin del Bloqueo"
        minTime={add30Minutes(startTime, currentBounds.closeMins)}
        maxTime={currentBounds.close24}
      />
    </div>
  );
};
