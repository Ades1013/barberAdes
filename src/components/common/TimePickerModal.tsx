import React, { useState, useEffect, useMemo } from 'react';
import { X, Clock, Check } from 'lucide-react';

export interface TimePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: string; // "HH:mm" in 24h format
  onChange: (newTime24: string) => void;
  title?: string;
  minTime?: string; // Optional "HH:mm" in 24h format
  maxTime?: string; // Optional "HH:mm" in 24h format
}

const HOURS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const;
// Requisito 2: ÚNICAMENTE 00 y 30 para bloques de 30 minutos
const MINUTES = ['00', '30'] as const;
const PERIODS = ['am', 'pm'] as const;

function timeToMins(val: string): number {
  if (!val || !val.includes(':')) return -1;
  const [h, m] = val.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getMins24(hStr: string, mStr: string, period: 'am' | 'pm'): number {
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  if (period === 'pm' && h < 12) h += 12;
  if (period === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

function parse24hTimeTo12hParts(val: string) {
  let rawHour = 11;
  let rawMin = 30;

  if (val && val.includes(':')) {
    const parts = val.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(h)) rawHour = h;
    if (!isNaN(m)) rawMin = m;
  }

  const period: 'am' | 'pm' = rawHour >= 12 ? 'pm' : 'am';
  let h12 = rawHour % 12;
  if (h12 === 0) h12 = 12;
  const hourStr = h12.toString().padStart(2, '0');

  // Ajuste estricto a los 2 bloques válidos: 00 o 30
  const minStr = rawMin < 15 || rawMin >= 45 ? '00' : '30';

  return {
    hour: hourStr,
    minute: minStr,
    period,
  };
}

export const TimePickerModal: React.FC<TimePickerModalProps> = ({
  isOpen,
  onClose,
  value,
  onChange,
  title = 'Seleccionar Horario',
  minTime,
  maxTime,
}) => {
  // Requisito 2: Estado interno fijo e interactivo.
  // La ventana permanece abierta mientras el usuario cambia Hora, Minutos y Franja.
  const [selectedHour, setSelectedHour] = useState<string>(() => parse24hTimeTo12hParts(value).hour);
  const [selectedMinute, setSelectedMinute] = useState<string>(() => parse24hTimeTo12hParts(value).minute);
  const [selectedPeriod, setSelectedPeriod] = useState<'am' | 'pm'>(() => parse24hTimeTo12hParts(value).period);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const minLimitMins = useMemo(() => {
    return minTime ? timeToMins(minTime) : -1;
  }, [minTime]);

  const maxLimitMins = useMemo(() => {
    return maxTime ? timeToMins(maxTime) : -1;
  }, [maxTime]);

  const isSlotAllowed = (mins: number) => {
    if (minLimitMins >= 0 && mins < minLimitMins) return false;
    if (maxLimitMins >= 0 && mins > maxLimitMins) return false;
    return true;
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      let targetVal = value;
      const valMins = timeToMins(value);
      if (minLimitMins >= 0 && valMins < minLimitMins) {
        const nextRoundedMins = Math.ceil(minLimitMins / 30) * 30;
        const cap = maxLimitMins >= 0 ? Math.min(nextRoundedMins, maxLimitMins) : Math.min(nextRoundedMins, 23 * 60 + 30);
        const nh = Math.floor(cap / 60);
        const nm = cap % 60;
        targetVal = `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
      } else if (maxLimitMins >= 0 && valMins > maxLimitMins) {
        const prevRoundedMins = Math.floor(maxLimitMins / 30) * 30;
        const floor = minLimitMins >= 0 ? Math.max(prevRoundedMins, minLimitMins) : Math.max(prevRoundedMins, 0);
        const nh = Math.floor(floor / 60);
        const nm = floor % 60;
        targetVal = `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
      }
      const parsed = parse24hTimeTo12hParts(targetVal);
      setSelectedHour(parsed.hour);
      setSelectedMinute(parsed.minute);
      setSelectedPeriod(parsed.period);
    }
  }, [isOpen, value, minLimitMins, maxLimitMins]);

  // Soporte global de tecla Escape (Esc)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Cálculo en tiempo real de formato 24h
  const current24h = (() => {
    let numH = parseInt(selectedHour, 10);
    if (selectedPeriod === 'pm') {
      if (numH < 12) numH += 12;
    } else {
      if (numH === 12) numH = 0;
    }
    return `${numH.toString().padStart(2, '0')}:${selectedMinute}`;
  })();

  const handleConfirm = () => {
    const chosenMins = timeToMins(current24h);
    if (minLimitMins >= 0 && chosenMins < minLimitMins) {
      setErrorMsg('El horario seleccionado está antes del horario permitido');
      return;
    }
    if (maxLimitMins >= 0 && chosenMins > maxLimitMins) {
      setErrorMsg('El horario seleccionado está fuera del horario de atención de la barbería');
      return;
    }
    onChange(current24h);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#12151b] border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header del Selector */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
              <p className="text-[11px] text-slate-400">Selecciona hora, minutos (00/30) y franja</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Cerrar selector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Display del Horario Seleccionado */}
        <div className="px-5 py-2.5 bg-slate-950/50 border-b border-slate-800/80 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">Horario seleccionado:</span>
          <div className="flex items-center gap-1.5 bg-slate-900 border border-amber-500/40 px-3 py-1 rounded-xl shadow-xs">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-sm font-black text-amber-400 tracking-wider font-mono">
              {selectedHour}:{selectedMinute} {selectedPeriod.toUpperCase()}
            </span>
            <span className="text-[10px] text-slate-400 font-mono ml-1">({current24h})</span>
          </div>
        </div>

        {/* 3 Columnas fijas compactas: Columna Hora (span 2) y Columna Minutos/Franja (span 1) */}
        <div className="p-4 grid grid-cols-3 gap-2.5 sm:gap-3 bg-[#12151b]">
          {/* Sección 'Hora': Cuadrícula de 2 columnas con flujo por filas (01-02, 03-04, 05-06, etc.) */}
          <div className="col-span-2 flex flex-col">
            <div className="text-xs font-semibold text-slate-400 mb-1.5 text-center pb-1 border-b border-slate-800">
              Hora
            </div>
            <div className="grid grid-cols-2 gap-2">
              {HOURS.map((h) => {
                const isSelected = h === selectedHour;
                const mins00 = getMins24(h, '00', selectedPeriod);
                const mins30 = getMins24(h, '30', selectedPeriod);
                const isOutOfBounds = !isSlotAllowed(mins00) && !isSlotAllowed(mins30);
                return (
                  <button
                    key={h}
                    type="button"
                    disabled={isOutOfBounds}
                    onClick={() => {
                      setSelectedHour(h);
                      const currentCombo = getMins24(h, selectedMinute, selectedPeriod);
                      if (!isSlotAllowed(currentCombo)) {
                        const altMin = selectedMinute === '00' ? '30' : '00';
                        if (isSlotAllowed(getMins24(h, altMin, selectedPeriod))) {
                          setSelectedMinute(altMin);
                        }
                      }
                      setErrorMsg(null);
                    }}
                    className={`w-full py-2 px-1 text-center text-xs font-bold rounded-lg transition-all ${
                      isOutOfBounds
                        ? 'bg-slate-900/40 text-slate-600 line-through cursor-not-allowed border border-slate-800/40'
                        : isSelected
                        ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md cursor-pointer'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 shadow-xs cursor-pointer'
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Columna 3: Dividida en Minutos (:00 y :30) y Franja (AM y PM) */}
          <div className="flex flex-col justify-between">
            {/* Bloque Superior: Minutos */}
            <div className="flex flex-col">
              <div className="text-xs font-semibold text-slate-400 mb-1.5 text-center pb-1 border-b border-slate-800">
                Minutos
              </div>
              <div className="flex flex-col gap-1.5">
                {MINUTES.map((m) => {
                  const isSelected = m === selectedMinute;
                  const isOutOfBounds = !isSlotAllowed(getMins24(selectedHour, m, selectedPeriod));
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={isOutOfBounds}
                      onClick={() => {
                        setSelectedMinute(m);
                        setErrorMsg(null);
                      }}
                      className={`w-full py-2 px-1 text-center text-xs font-bold rounded-lg transition-all ${
                        isOutOfBounds
                          ? 'bg-slate-900/40 text-slate-600 line-through cursor-not-allowed border border-slate-800/40'
                          : isSelected
                          ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md cursor-pointer'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 shadow-xs cursor-pointer'
                      }`}
                    >
                      :{m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bloque Inferior: Franja AM/PM */}
            <div className="flex flex-col mt-2">
              <div className="text-xs font-semibold text-slate-400 mb-1.5 text-center pb-1 border-b border-slate-800">
                Franja
              </div>
              <div className="flex flex-col gap-1.5">
                {PERIODS.map((p) => {
                  const isSelected = p === selectedPeriod;
                  const hasValidInPeriod = HOURS.some(
                    (h) => isSlotAllowed(getMins24(h, '00', p)) || isSlotAllowed(getMins24(h, '30', p))
                  );
                  const isOutOfBounds = !hasValidInPeriod;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={isOutOfBounds}
                      onClick={() => {
                        setSelectedPeriod(p);
                        if (!isSlotAllowed(getMins24(selectedHour, selectedMinute, p))) {
                          for (const h of HOURS) {
                            for (const m of MINUTES) {
                              if (isSlotAllowed(getMins24(h, m, p))) {
                                setSelectedHour(h);
                                setSelectedMinute(m);
                                break;
                              }
                            }
                            if (
                              isSlotAllowed(getMins24(h, '00', p)) ||
                              isSlotAllowed(getMins24(h, '30', p))
                            ) {
                              break;
                            }
                          }
                        }
                        setErrorMsg(null);
                      }}
                      className={`w-full py-2 px-1 text-center text-xs uppercase font-extrabold rounded-lg transition-all ${
                        isOutOfBounds
                          ? 'bg-slate-900/40 text-slate-600 line-through cursor-not-allowed border border-slate-800/40'
                          : isSelected
                          ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md cursor-pointer'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 shadow-xs cursor-pointer'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="px-4 py-2 bg-rose-950/80 border-t border-rose-800/80 text-rose-300 text-xs font-semibold text-center">
            {errorMsg}
          </div>
        )}

        {/* Footer con Confirmación */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-md cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Confirmar Horario</span>
          </button>
        </div>
      </div>
    </div>
  );
};
