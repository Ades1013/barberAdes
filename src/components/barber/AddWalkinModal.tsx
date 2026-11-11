import React, { useState, useEffect, useMemo } from 'react';
import { X, UserPlus, Scissors, Clock, DollarSign, User, Phone, Calendar, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Barber, Service, Appointment } from '../../types';
import { storageService } from '../../services/storageService';
import { realtimeService } from '../../services/realtimeService';
import { formatCurrency, formatDateLabel, formatTimeTo12h, generateNextBookingCode, normalizeTime, normalizeTimeTo24h, formatPhoneForWhatsApp } from '../../utils/dateUtils';
import { PhoneInputWithCountry, validatePhoneDigits } from '../common/PhoneInputWithCountry';
import { TimePickerModal } from '../common/TimePickerModal';

interface AddWalkinModalProps {
  isOpen: boolean;
  onClose: () => void;
  barber: Barber;
  services: Service[];
  date: string;
  defaultTime?: string;
  onAppointmentAdded: (appointment?: Appointment) => void;
}

const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const DAY_HEADERS_ES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

export const AddWalkinModal: React.FC<AddWalkinModalProps> = ({
  isOpen,
  onClose,
  barber,
  services,
  date,
  defaultTime = '11:30',
  onAppointmentAdded,
}) => {
  // Fecha de hoy en formato local sin desfases UTC
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

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (date && date >= todayStr) return date;
    return todayStr;
  });

  // Rango estricto de apertura y cierre del local (working_hours) para la fecha seleccionada
  const { openTime24, closeTime24, lastValidSlotTime24, openMins, closeMins, lastSlotMins } = useMemo(() => {
    const wh = barber?.workingHours || (barber as any)?.working_hours || {};
    const specialList: any[] = [
      ...(Array.isArray(wh.specialDaySchedules) ? wh.specialDaySchedules : []),
      ...(Array.isArray((barber?.schedule as any)?.exceptions) ? (barber.schedule as any).exceptions : []),
      ...(Array.isArray((barber?.schedule as any)?.special_hours) ? (barber.schedule as any).special_hours : []),
    ];
    let specialForDate: any = null;
    if (selectedDate) {
      const [yy, mm, dd] = selectedDate.split('-').map(Number);
      const dayOfWeek = new Date(yy, mm - 1, dd).getDay();
      specialForDate =
        specialList.find((s) => s && s.date === selectedDate) ||
        specialList.find((s) => s && !s.date && Number(s.dayOfWeek) === dayOfWeek);
    }

    const o24 = normalizeTimeTo24h(
      specialForDate?.start || wh.start || barber?.openTime || (barber?.schedule as any)?.openTime || '09:00',
      '09:00'
    );
    const c24 = normalizeTimeTo24h(
      specialForDate?.end || wh.end || barber?.closeTime || (barber?.schedule as any)?.closeTime || '20:00',
      '20:00'
    );
    const [oh, om] = o24.split(':').map(Number);
    const [ch, cm] = c24.split(':').map(Number);
    const oM = (oh || 0) * 60 + (om || 0);
    const cM = (ch || 0) * 60 + (cm || 0);
    const slotDur = Number(wh.slotDurationMinutes || 30);
    const lastM = Math.max(oM, cM - slotDur);
    const lh = Math.floor(lastM / 60);
    const lm = lastM % 60;
    const last24 = `${String(lh).padStart(2, '0')}:${String(lm).padStart(2, '0')}`;
    return {
      openTime24: o24,
      closeTime24: c24,
      lastValidSlotTime24: last24,
      openMins: oM,
      closeMins: cM,
      lastSlotMins: lastM,
    };
  }, [barber, selectedDate]);

  const effectiveMinTime24 = useMemo(() => {
    if (selectedDate === todayStr) {
      const [ch, cm] = currentTime24.split(':').map(Number);
      const curM = (ch || 0) * 60 + (cm || 0);
      if (curM > openMins) {
        return currentTime24;
      }
    }
    return openTime24;
  }, [selectedDate, todayStr, currentTime24, openMins, openTime24]);

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [time, setTime] = useState(() => {
    const raw24 = normalizeTimeTo24h(defaultTime || openTime24, openTime24);
    const [h, m] = raw24.split(':').map(Number);
    let targetMins = (h || 0) * 60 + (m || 0);
    if ((date || todayStr) === todayStr) {
      const n = new Date();
      const currentMins = n.getHours() * 60 + n.getMinutes();
      if (targetMins < currentMins) {
        targetMins = Math.ceil(currentMins / 30) * 30;
      }
    }
    const clamped = Math.max(openMins, Math.min(targetMins, lastSlotMins));
    const nh = Math.floor(clamped / 60);
    const nm = clamped % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  });
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Restricción: Mes actual y mes próximo
  const currentMonthIndex = today.getMonth();
  const currentYear = today.getFullYear();
  const nextMonthIndex = (currentMonthIndex + 1) % 12;
  const nextMonthYear = currentMonthIndex === 11 ? currentYear + 1 : currentYear;

  // Último día del mes próximo
  const maxDateStr = useMemo(() => {
    const lastDayNextMonth = new Date(nextMonthYear, nextMonthIndex + 1, 0);
    const y = lastDayNextMonth.getFullYear();
    const m = String(lastDayNextMonth.getMonth() + 1).padStart(2, '0');
    const day = String(lastDayNextMonth.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, [nextMonthIndex, nextMonthYear]);

  // Estado del mes visualizado en el calendario (0 = mes actual, 1 = mes próximo)
  const [calendarMonthOffset, setCalendarMonthOffset] = useState<0 | 1>(0);

  const displayedYear = calendarMonthOffset === 0 ? currentYear : nextMonthYear;
  const displayedMonth = calendarMonthOffset === 0 ? currentMonthIndex : nextMonthIndex;

  useEffect(() => {
    if (date) {
      setSelectedDate(date < todayStr ? todayStr : date);
    }
  }, [date, todayStr]);

  // Asegurar que la hora seleccionada siempre esté dentro del horario de atención del local y no en el pasado
  useEffect(() => {
    const [h, m] = (time || openTime24).split(':').map(Number);
    let slotMins = (h || 0) * 60 + (m || 0);
    if (selectedDate === todayStr) {
      const n = new Date();
      const currentMins = n.getHours() * 60 + n.getMinutes();
      if (slotMins < currentMins) {
        slotMins = Math.ceil(currentMins / 30) * 30;
      }
    }
    const clamped = Math.max(openMins, Math.min(slotMins, lastSlotMins));
    if (clamped !== (h || 0) * 60 + (m || 0)) {
      const nh = Math.floor(clamped / 60);
      const nm = clamped % 60;
      setTime(`${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`);
    }
  }, [selectedDate, todayStr, openMins, lastSlotMins, openTime24]);

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

  // Requisito 3: El selector desplegable de servicios debe leer únicamente el catálogo de servicios activo del barbero logueado (barber.services)
  const activeServices: Service[] = React.useMemo(() => {
    // 1. Catálogo propio configurado directamente en el barbero
    if (Array.isArray(barber?.services) && barber.services.length > 0) {
      return barber.services;
    }
    // 2. Perfil guardado en almacenamiento local o nube
    if (barber?.id || barber?.userId) {
      const savedProfile = storageService.getBarberProfile(barber.id, barber.email);
      if (Array.isArray(savedProfile?.services) && savedProfile.services.length > 0) {
        return savedProfile.services;
      }
    }
    // 3. Filtrar por los IDs de servicio específicos del barbero
    if (Array.isArray(barber?.serviceIds) && barber.serviceIds.length > 0 && Array.isArray(services)) {
      const custom = services.filter((s) => barber.serviceIds!.includes(s.id));
      if (custom.length > 0) return custom;
    }
    return [];
  }, [barber, services]);

  const [selectedServiceId, setSelectedServiceId] = useState(() => activeServices[0]?.id || '');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('Cliente en sala de espera');

  useEffect(() => {
    if (defaultTime) setTime(defaultTime);
  }, [defaultTime]);

  useEffect(() => {
    if (activeServices.length > 0 && (!selectedServiceId || !activeServices.some((s) => s.id === selectedServiceId))) {
      setSelectedServiceId(activeServices[0].id);
    }
  }, [activeServices, selectedServiceId]);

  // Soporte global de tecla Escape (Esc)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTimePickerOpen) {
        setIsTimePickerOpen(false);
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
  }, [isOpen, isTimePickerOpen, isDatePickerOpen, onClose]);

  const selectedService: Service = activeServices.find((s) => s.id === selectedServiceId) || activeServices[0] || {
    id: 's-presencial',
    name: 'Servicio Presencial',
    price: 0,
    durationMinutes: 30,
    category: 'corte',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || isSubmitting) return;

    setAvailabilityError(null);
    setIsSubmitting(true);

    try {
      // Requisito 5: Bloqueo estricto de fechas y horas pasadas
      const nowCurrent = new Date();
      const currentMins = nowCurrent.getHours() * 60 + nowCurrent.getMinutes();
      const [h, m] = (time || '00:00').split(':').map(Number);
      const selectedSlotMins = (h || 0) * 60 + (m || 0);

      if (selectedDate < todayStr || (selectedDate === todayStr && selectedSlotMins < currentMins)) {
        setAvailabilityError('No puedes registrar un turno en una fecha u hora que ya pasó.');
        setIsSubmitting(false);
        return;
      }

      if (selectedSlotMins < openMins || selectedSlotMins > lastSlotMins) {
        setAvailabilityError(
          `El horario elegido está fuera del horario de atención del local (${formatTimeTo12h(openTime24)} - ${formatTimeTo12h(closeTime24)}).`
        );
        setIsSubmitting(false);
        return;
      }

      // Requisito 4: Control estricto de dígitos del teléfono por país
      if (clientPhone && clientPhone.trim() && clientPhone.trim() !== 'Presencial') {
        const phoneCheck = validatePhoneDigits(clientPhone);
        if (!phoneCheck.isValid) {
          setAvailabilityError(
            phoneCheck.message ||
              `El número de teléfono ingresado debe tener exactamente ${phoneCheck.expected} dígitos.`
          );
          setIsSubmitting(false);
          return;
        }
      }

      // Requisito 4: Validación asíncrona de disponibilidad antes de insertar
      const availCheck = await storageService.checkSlotAvailability(barber.id, selectedDate, time);
      if (!availCheck.isAvailable) {
        setAvailabilityError(
          availCheck.message ||
            'Error: Este horario ya se encuentra ocupado o bloqueado. Por favor, selecciona una hora diferente o cancela el turno existente primero.'
        );
        setIsSubmitting(false);
        return;
      }

      const randomCode = generateNextBookingCode('CO');
      const normalized = normalizeTime(time);
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'c34ff7ab-e35d-4961-8ba8-ef523a63fbe7';
      const realBarberId = (barber.id && barber.id !== 'b-marcos' && barber.id !== 'barbero' && barber.id !== 'default')
        ? barber.id
        : 'bdd42dc3-b0b3-4ae6-9fa4-25d70525765f';

      const newAppointment: Appointment = {
        id: newId,
        code: randomCode,
        clientId: `usr-walkin-${Date.now()}`,
        client_id: `usr-walkin-${Date.now()}`,
        barberId: realBarberId,
        barber_id: realBarberId,
        barberEmail: barber.email || 'juanja1013@gmail.com',
        barber_email: barber.email || 'juanja1013@gmail.com',
        barberName: barber.name || 'Juan Jaramillo',
        barber_name: barber.name || 'Juan Jaramillo',
        serviceId: selectedService.id,
        service_id: selectedService.id,
        serviceName: selectedService.name,
        service_name: selectedService.name,
        servicePrice: selectedService.price,
        service_price: selectedService.price,
        price: selectedService.price,
        serviceDuration: selectedService.durationMinutes,
        date: selectedDate,
        appointment_date: selectedDate,
        time: normalized,
        appointment_time: normalized,
        clientName: clientName.trim(),
        client_name: clientName.trim(),
        clientPhone: clientPhone.trim() || 'Presencial',
        client_phone: clientPhone.trim() || 'Presencial',
        clientNotes: notes.trim(),
        client_notes: notes.trim(),
        status: 'confirmed',
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        source: 'walk_in',
        type: 'presencial',
      };

      // 1. Guardar en Supabase y en localStorage como respaldo garantizado
      try {
        await storageService.addAppointment(newAppointment);
      } catch (err: any) {
        setAvailabilityError('Este turno acaba de ser tomado por otra persona. Por favor, recarga o elige otro.');
        setIsSubmitting(false);
        return;
      }

      // 2. Emisión instantánea en tiempo real sin parpadeos vía BroadcastChannel y Evento Storage
      storageService.broadcastAppointmentEvent('NEW_BOOKING', newAppointment);

      realtimeService.emit({
        type: 'NEW_BOOKING',
        actor: 'barber',
        payload: newAppointment,
        message: 'Turno reservado con éxito',
      });

      // 3. Requisito 3: Envío automático por WhatsApp si se ingresó teléfono
      const cleanPhone = formatPhoneForWhatsApp(clientPhone);
      if (cleanPhone && clientPhone.trim() !== 'Presencial') {
        const shopName = (barber.barbershopName || (barber as any).business_name || (barber as any).shop_name || 'LA BARBERÍA').toUpperCase();
        const dateFormatted = formatDateLabel(selectedDate);
        const time12 = formatTimeTo12h(time);
        const msg = `¡Hola ${clientName.trim()}! Te confirmamos tu turno en ${shopName}:\n\n` +
          `💈 *Barbero:* ${barber.name}\n` +
          `✂️ *Servicio:* ${selectedService.name}\n` +
          `📅 *Fecha:* ${dateFormatted} a las ${time12}\n` +
          `🏷️ *Código:* ${randomCode}\n` +
          `💰 *Total:* ${formatCurrency(selectedService.price)}\n\n` +
          `¡Te esperamos en la Barbería!`;
        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        try {
          window.open(whatsappUrl, '_blank');
        } catch (e) {
          console.warn('No se pudo abrir WhatsApp automáticamente:', e);
        }
      }

      onAppointmentAdded(newAppointment);
      onClose();
    } catch (err: any) {
      console.error('Error al agendar turno presencial:', err);
      setAvailabilityError(err?.message || 'Error al validar y guardar el turno.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#12151b] border border-amber-500/30 rounded-2xl p-5 sm:p-6 text-slate-100 shadow-2xl my-auto max-h-[92vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
        {/* Cabecera integrada con scroll libre */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Turno Manual / Cliente Presencial</h2>
              <p className="text-xs text-slate-400">
                Registra un turno directo para un cliente que llegó al local.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Requisito 4: Selector de Fecha Interactivo con Calendario Desplegable */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Fecha del Turno
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

            {/* Calendario Desplegable Restringido (Mes Actual y Mes Próximo) */}
            {isDatePickerOpen && (
              <div className="mt-2 p-3 bg-slate-950 border border-amber-500/40 rounded-xl shadow-2xl animate-in zoom-in-95 duration-150">
                {/* Cabecera del Calendario */}
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

                {/* Días de la Semana */}
                <div className="grid grid-cols-7 gap-1 text-center mb-1">
                  {DAY_HEADERS_ES.map((h, i) => (
                    <span key={i} className="text-[10px] font-semibold text-slate-400">
                      {h}
                    </span>
                  ))}
                </div>

                {/* Cuadrícula de Días */}
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
                          setIsDatePickerOpen(false);
                          setAvailabilityError(null);
                        }}
                        className={`h-7 w-full rounded-md text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${
                          isDisabled
                            ? 'text-slate-600 cursor-not-allowed bg-transparent'
                            : isSelected
                            ? 'bg-amber-500 text-slate-950 font-black shadow-md'
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Horario</label>
              <div
                onClick={() => setIsTimePickerOpen(true)}
                className="relative cursor-pointer group"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsTimePickerOpen(true);
                  }
                }}
              >
                <Clock className="w-4 h-4 text-amber-400 group-hover:text-amber-300 transition-colors absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer" />
                <div className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 group-hover:border-amber-500/80 rounded-xl text-xs text-white transition-colors flex items-center justify-between shadow-xs">
                  <span className="font-semibold text-white tracking-wide">{formatTimeTo12h(time)}</span>
                  <span className="text-[10px] text-amber-400 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                    Elegir
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Servicio</label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                disabled={activeServices.length === 0}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 transition-colors disabled:opacity-60 shadow-xs"
              >
                {activeServices.length === 0 ? (
                  <option value="">(Sin servicios en Mi Negocio)</option>
                ) : (
                  activeServices.map((s) => (
                    <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                      {s.name} ({formatCurrency(s.price)})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nombre del Cliente *</label>
              <input
                type="text"
                required
                maxLength={20}
                placeholder="Ej. Rodrigo"
                value={clientName}
                onChange={(e) => setClientName(e.target.value.slice(0, 20))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors shadow-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Teléfono donde se enviará la confirmación (Opcional)</label>
              <PhoneInputWithCountry
                placeholder="Ej. 300 123 4567"
                value={clientPhone}
                onChange={(val) => setClientPhone(val)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Notas / Detalles</label>
            <input
              type="text"
              placeholder="Detalles sobre el corte o condición..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors shadow-xs"
            />
          </div>

          {/* Requisito 4: Alerta / Toast de Horario Ocupado o Bloqueado */}
          {availabilityError && (
            <div className="p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/80 text-rose-200 text-xs flex items-start gap-2.5 shadow-xl animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold leading-relaxed">{availabilityError}</p>
              </div>
              <button
                type="button"
                onClick={() => setAvailabilityError(null)}
                className="text-rose-400 hover:text-rose-200 p-0.5 cursor-pointer transition-colors"
                aria-label="Cerrar alerta"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-1/2 py-2.5 px-3 rounded-xl text-xs font-semibold border border-slate-800 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-1/2 py-2.5 px-3 rounded-xl text-xs font-bold transition-colors shadow-md cursor-pointer ${
                isSubmitting
                  ? 'bg-amber-600/50 text-slate-800 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              {isSubmitting ? 'Validando horario...' : 'Agendar Turno'}
            </button>
          </div>
        </form>
      </div>

      <TimePickerModal
        isOpen={isTimePickerOpen}
        onClose={() => setIsTimePickerOpen(false)}
        value={time}
        onChange={(newTime) => {
          setTime(newTime);
          setAvailabilityError(null);
        }}
        title="Horario del Turno Presencial"
        minTime={effectiveMinTime24}
        maxTime={lastValidSlotTime24}
      />
    </div>
  );
};
