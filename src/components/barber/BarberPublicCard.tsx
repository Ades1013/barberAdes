import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Eye,
  Building2,
  MapPin,
  Star,
  Scissors,
  Phone,
  Globe,
  Instagram,
  Clock,
  Mail,
  Sparkles,
  Check,
} from 'lucide-react';
import { Barber, Service, SocialLink, SocialPlatform } from '../../types';
import { formatCurrency, formatScheduleDisplay, formatTimeTo12h, normalizeWorkingDays, normalizeTimeTo24h, normalizeWorkingDaysToNumbers } from '../../utils/dateUtils';

export interface BarberPublicCardProps {
  barber: Barber | any;
  services?: Service[];
  barberServices?: Service[];
  formData?: {
    name?: string;
    nickname?: string;
    barbershopName?: string;
    address?: string;
    specialty?: string;
    bio?: string;
    phone?: string;
    email?: string;
    instagram?: string;
    avatarColor?: string;
    avatarUrl?: string;
    avatar_url?: string;
    avatar?: string;
    coverUrl?: string;
    cover_url?: string;
    workingDaysText?: string;
    workingDays?: string;
    workingHoursStart?: string;
    openTime?: string;
    workingHoursEnd?: string;
    closeTime?: string;
    schedule?: {
      workingDays: string;
      openTime: string;
      closeTime: string;
    };
    socialLinks?: SocialLink[];
    social_links?: SocialLink[];
  };
  isOpen?: boolean;
  onClose?: () => void;
  onEditMore?: () => void;
  theme?: 'light' | 'dark';
  asModal?: boolean;
}

const PLATFORM_CONFIG: Record<
  SocialPlatform,
  { label: string; prefix: string; color: string; border: string }
> = {
  instagram: {
    label: 'Instagram',
    prefix: '@',
    color: 'text-pink-400 bg-pink-950/30 border-pink-500/30',
    border: 'border-pink-500/30',
  },
  tiktok: {
    label: 'TikTok',
    prefix: '@',
    color: 'text-cyan-400 bg-cyan-950/30 border-cyan-500/30',
    border: 'border-cyan-500/30',
  },
  facebook: {
    label: 'Facebook',
    prefix: '',
    color: 'text-blue-400 bg-blue-950/30 border-blue-500/30',
    border: 'border-blue-500/30',
  },
  twitter: {
    label: 'X (Twitter)',
    prefix: '@',
    color: 'text-slate-300 bg-slate-800/50 border-slate-700',
    border: 'border-slate-700',
  },
  whatsapp: {
    label: 'WhatsApp',
    prefix: '+57',
    color: 'text-emerald-400 bg-emerald-950/30 border-emerald-500/30',
    border: 'border-emerald-500/30',
  },
  email: {
    label: 'Email',
    prefix: '',
    color: 'text-sky-400 bg-sky-950/50 border-sky-500/40',
    border: 'border-sky-500/40',
  },
  website: {
    label: 'Página Web',
    prefix: 'https://',
    color: 'text-amber-400 bg-amber-950/30 border-amber-500/30',
    border: 'border-amber-500/30',
  },
};

export function getSocialDeepLink(platform: SocialPlatform, rawUrl: string): string {
  const clean = (rawUrl || '').trim();
  if (!clean) return '#';

  switch (platform) {
    case 'whatsapp': {
      const digitsOnly = clean.replace(/\D/g, '');
      const numWithout57 = digitsOnly.replace(/^57/, '');
      return `https://wa.me/57${numWithout57}`;
    }
    case 'instagram': {
      let handle = clean.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[\/\?].*$/, '');
      handle = handle.replace(/^@/, '').trim();
      return `https://instagram.com/${handle}`;
    }
    case 'tiktok': {
      let handle = clean.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, '').replace(/[\/\?].*$/, '');
      handle = handle.replace(/^@/, '').trim();
      return `https://tiktok.com/@${handle}`;
    }
    case 'facebook': {
      let handle = clean.replace(/^https?:\/\/(www\.)?facebook\.com\//i, '').replace(/[\/\?].*$/, '');
      handle = handle.replace(/^\//, '').replace(/^@/, '').trim();
      return `https://facebook.com/${handle}`;
    }
    case 'twitter': {
      let handle = clean.replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '').replace(/[\/\?].*$/, '');
      handle = handle.replace(/^@/, '').trim();
      return `https://x.com/${handle}`;
    }
    case 'email': {
      const email = clean.replace(/^mailto:/i, '').trim();
      return `mailto:${email}`;
    }
    case 'website': {
      if (!/^https?:\/\//i.test(clean)) {
        return `https://${clean}`;
      }
      return clean.replace(/^http:\/\//i, 'https://');
    }
    default:
      return clean.startsWith('http') ? clean : `https://${clean}`;
  }
}

export const renderSocialIcon = (platform: SocialPlatform) => {
  switch (platform) {
    case 'instagram':
      return <Instagram className="w-3.5 h-3.5 text-pink-400" />;
    case 'tiktok':
      return <span className="font-bold text-[11px] text-cyan-400">TT</span>;
    case 'facebook':
      return <span className="font-bold text-[11px] text-blue-400">FB</span>;
    case 'twitter':
      return <span className="font-bold text-[11px] text-slate-300">𝕏</span>;
    case 'whatsapp':
      return <Phone className="w-3.5 h-3.5 text-emerald-400" />;
    case 'email':
      return <Mail className="w-3.5 h-3.5 text-sky-400" />;
    case 'website':
      return <Globe className="w-3.5 h-3.5 text-amber-400" />;
  }
};

// =========================================================================
// VISTA UNIFICADA OFICIAL DE LA TARJETA DEL BARBERO (100% IDÉNTICA EN TODAS LAS VISTAS)
// =========================================================================
export interface BarberOfficialCardViewProps {
  barber: Barber | any;
  services?: Service[];
  barberServices?: Service[];
  formData?: any;
  isSelected?: boolean;
  isHabitualBadge?: boolean;
  onSelect?: () => void;
  showServicesCatalog?: boolean;
}

export const BarberOfficialCardView: React.FC<BarberOfficialCardViewProps> = ({
  barber,
  services = [],
  barberServices = [],
  formData,
  isSelected = false,
  isHabitualBadge = false,
  onSelect,
  showServicesCatalog = false,
}) => {
  const name = (formData?.name?.trim() || barber?.name || '').trim();
  const nickname = (
    formData?.nickname?.trim() ||
    (formData as any)?.alias?.trim() ||
    barber?.alias ||
    barber?.nickname ||
    (barber as any)?.profile_meta?.alias ||
    (barber?.schedule as any)?.profile_meta?.alias ||
    (barber?.schedule as any)?.alias ||
    ''
  ).trim();
  const rawShop = (
    formData?.barbershopName?.trim() ||
    (formData as any)?.business_name?.trim() ||
    (formData as any)?.businessName?.trim() ||
    (formData as any)?.shop_name?.trim() ||
    barber?.business_name ||
    barber?.businessName ||
    barber?.barbershopName ||
    (barber as any)?.shop_name ||
    (barber as any)?.profile_meta?.business_name ||
    (barber?.schedule as any)?.profile_meta?.business_name ||
    (barber?.schedule as any)?.business_name ||
    ''
  ).trim();
  const barbershopName = rawShop ? rawShop.toUpperCase() : '';
  const address = (formData?.address || barber?.address || '').trim();
  const specialty = (formData?.specialty || barber?.specialty || '').trim();
  const bio = (formData?.bio || barber?.bio || '').trim();

  const scheduleObj = formData?.schedule || barber?.schedule || {};
  const workingHoursObj = barber?.workingHours || {};

  const candWorkingDays =
    formData?.workingDaysText ||
    formData?.workingDays ||
    barber?.workingDaysText ||
    barber?.workingDays ||
    (barber as any)?.working_days ||
    (barber as any)?.working_days_text ||
    'Lunes a Sábado';

  const workingDaysText = normalizeWorkingDays(candWorkingDays);

  const rawOpen =
    scheduleObj.openTime ||
    scheduleObj.open_time ||
    scheduleObj.start ||
    formData?.openTime ||
    formData?.workingHoursStart ||
    barber?.openTime ||
    (workingHoursObj.start ? formatTimeTo12h(workingHoursObj.start) : '') ||
    '9:00 am';

  const rawClose =
    scheduleObj.closeTime ||
    scheduleObj.close_time ||
    scheduleObj.end ||
    formData?.closeTime ||
    formData?.workingHoursEnd ||
    barber?.closeTime ||
    (workingHoursObj.end ? formatTimeTo12h(workingHoursObj.end) : '') ||
    '8:00 pm';

  // Indicador dinámico de estado en tiempo real: ABIERTO (verde) o CERRADO (rojo)
  const isOpenNow = React.useMemo(() => {
    try {
      const now = new Date();
      const currentDay = now.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb

      const workingDaysNumbers = normalizeWorkingDaysToNumbers(candWorkingDays);
      if (!workingDaysNumbers.includes(currentDay)) {
        return false;
      }

      const start24 = normalizeTimeTo24h(rawOpen, '09:00');
      const end24 = normalizeTimeTo24h(rawClose, '20:00');

      const [startH, startM] = start24.split(':').map(Number);
      const [endH, endM] = end24.split(':').map(Number);

      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
        return false;
      }

      const lunchBreak =
        (formData?.schedule as any)?.lunch_break ||
        (barber?.schedule as any)?.lunch_break ||
        barber?.workingHours?.lunchBreak;

      if (lunchBreak?.enabled && lunchBreak.start && lunchBreak.end) {
        const lStart24 = normalizeTimeTo24h(lunchBreak.start, '14:00');
        const lEnd24 = normalizeTimeTo24h(lunchBreak.end, '15:00');
        const [lsH, lsM] = lStart24.split(':').map(Number);
        const [leH, leM] = lEnd24.split(':').map(Number);
        const lStartMin = lsH * 60 + lsM;
        const lEndMin = leH * 60 + leM;
        if (currentMinutes >= lStartMin && currentMinutes < lEndMin) {
          return false;
        }
      }

      return true;
    } catch {
      return true;
    }
  }, [candWorkingDays, rawOpen, rawClose, formData, barber]);

  const bannerUrl =
    formData?.coverUrl ||
    formData?.cover_url ||
    barber?.coverUrl ||
    (barber as any)?.cover_url ||
    barber?.avatarUrl ||
    (barber as any)?.avatar_url ||
    formData?.avatarUrl ||
    '';

  const rawSocialLinks: SocialLink[] =
    formData?.socialLinks ||
    formData?.social_links ||
    barber?.socialLinks ||
    (barber as any)?.social_links ||
    [];

  const effectiveLinks = Array.isArray(rawSocialLinks) && rawSocialLinks.length > 0
    ? rawSocialLinks
    : [
        ...(barber?.phone ? [{ id: 'link-phone', platform: 'whatsapp' as SocialPlatform, url: barber.phone }] : []),
        ...(barber?.instagram ? [{ id: 'link-ig', platform: 'instagram' as SocialPlatform, url: barber.instagram }] : []),
      ];

  const validLinks = effectiveLinks.filter((l) => l && l.url && l.url.trim().length > 0);

  const effectiveServices: Service[] =
    barberServices && barberServices.length > 0
      ? barberServices
      : barber?.services && barber.services.length > 0
      ? barber.services
      : services && services.length > 0
      ? services
      : [];

  const rating = barber?.rating || 4.9;
  const reviewCount = barber?.reviewCount || (barber as any)?.reviews_count || 120;

  return (
    <div
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
          onSelect();
        }
      }}
      className={`rounded-2xl border transition-all relative overflow-hidden shadow-xl text-left ${
        isSelected
          ? 'bg-slate-900 border-amber-500 ring-2 ring-amber-500/50 shadow-amber-950/30'
          : 'border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950 hover:border-slate-700'
      } ${onSelect ? 'cursor-pointer' : ''}`}
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Portada ocupando exactamente el 50% de la proporción visual de la tarjeta (h-56) */}
      <div className="relative w-full h-56 overflow-hidden rounded-t-2xl border-b border-slate-800 bg-slate-950 flex items-center justify-center">
        {bannerUrl ? (
          <img
            key={`cover-${bannerUrl}`}
            src={bannerUrl}
            alt={name}
            className="w-full h-full object-cover object-center rounded-t-2xl"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-900 via-amber-950/20 to-slate-950 flex items-center justify-center">
            <Scissors className="w-16 h-16 text-amber-500/20 -rotate-45" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/40 to-slate-950/30 pointer-events-none" />

        {/* 1. Esquina inferior izquierda: Nombre de la Barbería en MAYÚSCULAS en amarillo y Especialidad en blanco */}
        <div className="absolute bottom-3.5 left-3.5 sm:bottom-4 sm:left-4 z-20 max-w-[55%] sm:max-w-[60%] space-y-0.5">
          <h2 className="text-sm sm:text-base md:text-lg font-black text-amber-400 tracking-wide uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] truncate">
            {barbershopName || <span className="text-amber-400/70 font-semibold normal-case text-xs italic">Configura el nombre de tu barbería</span>}
          </h2>
          <p className="text-[11px] sm:text-xs text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] truncate">
            {specialty || <span className="text-slate-300/70 italic text-[11px]">Sin especialidad registrada</span>}
          </p>
        </div>

        {/* 2. Esquina superior derecha: Estado en tiempo real ABIERTO (verde) / CERRADO (rojo) con destello en vivo */}
        <div className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 z-20 flex items-center gap-1.5">
          {isHabitualBadge && (
            <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 backdrop-blur-md border border-amber-500/40 px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Habitual</span>
            </span>
          )}
          {isOpenNow ? (
            <span className="text-[11px] sm:text-xs font-bold text-emerald-400 bg-emerald-950/75 border border-emerald-500/70 backdrop-blur-md px-3 py-1 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.35)] flex items-center gap-1.5 animate-pulse">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span>ABIERTO</span>
            </span>
          ) : (
            <span className="text-[11px] sm:text-xs font-bold text-rose-400 bg-rose-950/75 border border-rose-500/70 backdrop-blur-md px-3 py-1 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.35)] flex items-center gap-1.5 animate-pulse">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-400" />
              </span>
              <span>CERRADO</span>
            </span>
          )}
          {isSelected && (
            <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-md shrink-0">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          )}
        </div>

        {/* 3. Esquina inferior derecha: Calificación y total de votos */}
        <div className="absolute bottom-3.5 right-3.5 sm:bottom-4 sm:right-4 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-700/80 text-xs shadow-lg">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="font-bold text-white text-xs sm:text-sm">{rating}</span>
          <span className="text-slate-300 text-[10px] sm:text-xs font-normal">({reviewCount})</span>
        </div>
      </div>

      {/* Contenido Debajo de la Portada */}
      <div className="p-4 sm:p-5 space-y-4 relative z-10 w-full">
        {/* Fila superior dividida entre BARBERO (izquierda) y DIRECCIÓN Y HORARIOS (derecha) */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4 w-full pb-3.5 border-b border-slate-800/80">
          {/* Columna Izquierda: BARBERO */}
          <div className="w-full sm:w-auto shrink-0 min-w-0 sm:max-w-[45%] text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              BARBERO
            </span>
            <div className="space-y-0.5">
              {/* Fila 1: Nombre del Barbero en amarillo */}
              <div className="text-sm sm:text-base font-bold text-amber-400 tracking-tight leading-snug truncate">
                {name || <span className="text-slate-500 font-normal italic text-xs">Configura tu nombre</span>}
              </div>
              {/* Fila 2: Seudónimo/Alias en blanco sin recuadro amarillo */}
              <div className="text-xs sm:text-sm text-white font-medium leading-snug truncate">
                {nickname ? `"${nickname}"` : <span className="text-slate-500 italic text-xs">(Sin seudónimo)</span>}
              </div>
            </div>
          </div>

          {/* Columna Derecha: DIRECCIÓN Y HORARIOS (en móvil: 2 filas completas bien legibles, en desktop: alineado a la derecha) */}
          <div className="w-full sm:w-fit sm:max-w-[65%] text-left sm:text-right flex flex-col items-start sm:items-end min-w-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60 sm:ml-auto">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1 text-left sm:text-right">
              DIRECCIÓN Y HORARIOS
            </span>
            <div className="space-y-1.5 sm:space-y-1 w-full flex flex-col items-start sm:items-end">
              {/* Fila 1: Dirección en amarillo con señal interactiva clara hacia Google Maps */}
              {address ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ', Colombia')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="group/map inline-flex flex-wrap items-center sm:justify-end gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors text-left sm:text-right w-full cursor-pointer"
                  title="Haz clic para abrir la ubicación en Google Maps"
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 sm:hidden" />
                  <span className="underline decoration-amber-500/60 group-hover/map:decoration-amber-300 underline-offset-4 leading-tight break-words">
                    {address}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 group-hover/map:bg-amber-500/25 transition-colors shrink-0 no-underline">
                    Ver mapa ↗
                  </span>
                  <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 hidden sm:inline-block" />
                </a>
              ) : (
                <div className="flex items-center sm:justify-end gap-1.5 text-xs text-slate-500 italic text-left sm:text-right">
                  <MapPin className="w-3.5 h-3.5 text-slate-600 shrink-0 sm:hidden" />
                  <span className="truncate">Sin dirección registrada</span>
                  <MapPin className="w-3.5 h-3.5 text-slate-600 shrink-0 hidden sm:inline-block" />
                </div>
              )}
              {/* Fila 2: Horarios en color blanco normal */}
              <div className="flex items-center sm:justify-end gap-1.5 text-xs text-left sm:text-right w-full">
                <Clock className="w-3.5 h-3.5 text-white shrink-0 sm:hidden" />
                <span className="text-white font-medium leading-tight line-clamp-2 break-words text-left sm:text-right">
                  {formatScheduleDisplay(workingDaysText, rawOpen, rawClose)}
                </span>
                <Clock className="w-3.5 h-3.5 text-white shrink-0 hidden sm:inline-block" />
              </div>
            </div>
          </div>
        </div>

        {/* Parte inferior: Biografía Profesional centrada en cursiva */}
        {bio && (
          <p className="italic text-slate-300 text-xs sm:text-sm text-center py-2.5 px-4 bg-slate-950/60 rounded-xl border border-slate-800/80 leading-relaxed">
            "{bio}"
          </p>
        )}

        {/* Botones de Redes Sociales / Contacto Directo */}
        {validLinks.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80">
            <span className="text-slate-300 font-bold tracking-wider text-[11px] uppercase block mb-2">
              REDES SOCIALES & CONTACTO DIRECTO:
            </span>
            <div className="flex flex-wrap gap-2">
              {validLinks.map((l) => {
                const conf = PLATFORM_CONFIG[l.platform] || {
                  label: l.platform,
                  prefix: '',
                  color: 'text-amber-400 bg-amber-950/30 border-amber-500/30',
                  border: 'border-amber-500/30',
                };
                const deepLink = getSocialDeepLink(l.platform, l.url);
                return (
                  <a
                    key={l.id || `${l.platform}-${l.url}`}
                    href={deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold hover:opacity-85 transition-opacity cursor-pointer ${conf.color}`}
                    title={`Abrir ${conf.label}`}
                  >
                    {renderSocialIcon(l.platform)}
                    <span>{conf.label}:</span>
                    <span className="font-mono">{l.url}</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Catálogo de Servicios opcional */}
        {showServicesCatalog && (
          <div className="space-y-3 pt-3 border-t border-slate-800/80">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Scissors className="w-4 h-4 text-amber-400" />
              <span>Catálogo de Servicios ({effectiveServices.length})</span>
            </h4>

            {effectiveServices.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center text-xs text-slate-400">
                Aún no has configurado servicios personalizados.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {effectiveServices.map((srv) => (
                  <div
                    key={srv.id}
                    className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between gap-2 shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-3 w-full">
                      <h5 className="font-bold text-white text-xs">{srv.name}</h5>
                      <span className="font-mono font-bold text-amber-400 text-sm tabular-nums shrink-0">
                        {formatCurrency(srv.price)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed w-full">
                      {srv.description || 'Servicio profesional con acabado de máxima atención.'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const BarberPublicCard: React.FC<BarberPublicCardProps> = ({
  barber,
  services,
  barberServices,
  formData,
  isOpen = true,
  onClose,
  onEditMore,
  theme,
  asModal = true,
}) => {
  useEffect(() => {
    if (!asModal || !isOpen) return;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (typeof document !== 'undefined') {
        const stillOpen = document.querySelectorAll('[data-modal-open="true"]').length;
        if (stillOpen <= 1) {
          document.body.style.overflow = '';
        }
      }
    };
  }, [asModal, isOpen, onClose]);

  if (asModal && !isOpen) return null;

  const isLight =
    theme === 'light' ||
    (typeof document !== 'undefined' && document.documentElement.classList.contains('light'));

  const cardContent = (
    <div className="relative flex flex-col max-h-[88dvh] overflow-y-auto rounded-2xl bg-[#0B0F17] border border-slate-800 w-full max-w-2xl my-auto shadow-2xl text-slate-100 transition-colors">
      {/* Cabecera integrada en el desplazamiento (se desplaza junto con el resto del texto) */}
      <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/80">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Ficha Pública de la Barbería</span>
              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                Tarjeta Oficial
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Así ven los clientes tu información, redes sociales y catálogo de servicios.
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Cuerpo en flujo continuo con el desplazamiento del contenedor */}
      <div className="px-6 py-5 space-y-6">
        <BarberOfficialCardView
          barber={barber}
          services={services}
          barberServices={barberServices}
          formData={formData}
          showServicesCatalog={true}
        />
      </div>

      {/* Pie Fijo abajo para acciones */}
      {(onEditMore || onClose) && (
        <div className="sticky bottom-0 z-20 px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3 bg-[#0B0F17]/95 backdrop-blur-md shadow-lg">
          {onEditMore && (
            <button
              type="button"
              onClick={onEditMore}
              className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-colors cursor-pointer shadow-sm"
            >
              ← Editar más datos
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-all shadow-md cursor-pointer"
            >
              Listo / Cerrar
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (asModal) {
    const modalContent = (
      <div
        data-modal-open="true"
        className={`fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 ${
          isLight ? 'bg-slate-100/95' : 'bg-black/80'
        } backdrop-blur-md animate-in fade-in duration-200`}
      >
        {cardContent}
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
  }

  return cardContent;
};

export default BarberPublicCard;
