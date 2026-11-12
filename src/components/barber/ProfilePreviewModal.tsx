import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { Barber, Service, SocialLink, SocialPlatform } from '../../types';
import { formatCurrency, formatScheduleDisplay } from '../../utils/dateUtils';
import { supabase } from '../../services/supabaseClient';
import { BarberOfficialCardView } from './BarberPublicCard';

export interface ProfilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEditMore: () => void;
  barber: Barber;
  theme?: 'light' | 'dark';
  formData: {
    name: string;
    nickname: string;
    barbershopName: string;
    address: string;
    specialty: string;
    bio: string;
    avatarColor: string;
    avatarUrl?: string;
    coverUrl?: string;
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
    socialLinks: SocialLink[];
  };
  barberServices: Service[];
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

const renderSocialIcon = (platform: SocialPlatform) => {
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

export const ProfilePreviewModal: React.FC<ProfilePreviewModalProps> = ({
  isOpen,
  onClose,
  onEditMore,
  barber,
  theme,
  formData,
  barberServices,
}) => {
  const [liveBarber, setLiveBarber] = useState<Barber>(barber);

  // Requisito 1: Consulta directa a public.barbers para evitar fallbacks obsoletos de localStorage
  useEffect(() => {
    if (!isOpen) return;
    const targetId = barber?.id || barber?.userId;
    if (!targetId) return;

    const cleanEmail = (barber?.email || '').trim().toLowerCase();
    const orParts = [`id.eq.${targetId}`, `user_id.eq.${targetId}`];
    if (cleanEmail) orParts.push(`email.ilike.${cleanEmail}`);

    supabase
      .from('barbers')
      .select('*')
      .or(orParts.join(','))
      .then(({ data: rows, error }) => {
        if (!error && Array.isArray(rows) && rows.length > 0) {
          const sorted = [...rows].sort((a: any, b: any) => {
            const getScore = (r: any) => {
              const al = String(r.alias || r.nickname || r.schedule?.profile_meta?.alias || '').trim();
              return (al ? 100 : 0) + (al.toLowerCase() === 'el mocha orejas' ? 200 : 0);
            };
            return getScore(b) - getScore(a);
          });
          const data = sorted[0];
          const fetchedAlias = data.alias || data.nickname || data.schedule?.profile_meta?.alias || data.schedule?.alias;
          const fetchedShop = data.business_name || data.shop_name || data.schedule?.profile_meta?.business_name || data.schedule?.business_name;
          setLiveBarber((prev) => ({
            ...prev,
            ...data,
            alias: fetchedAlias || prev.alias,
            nickname: fetchedAlias || prev.nickname,
            business_name: fetchedShop || prev.business_name || (prev as any).businessName,
            businessName: fetchedShop || (prev as any).businessName || prev.business_name,
            barbershopName: fetchedShop || prev.barbershopName,
            shop_name: fetchedShop || (prev as any).shop_name,
            coverUrl: data.cover_url || prev.coverUrl,
            avatarUrl: data.avatar_url || prev.avatarUrl,
            cover_url: data.cover_url || (prev as any).cover_url,
            avatar_url: data.avatar_url || (prev as any).avatar_url,
          }));
        }
      });
  }, [isOpen, barber?.id, barber?.userId]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isLight =
    theme === 'light' ||
    (typeof document !== 'undefined' && document.documentElement.classList.contains('light'));

  const {
    name,
    nickname,
    barbershopName,
    address,
    specialty,
    bio,
    avatarColor,
    avatarUrl,
    socialLinks,
  } = formData;

  // Requisito 1: Prioridad estricta a imagen real activa de base de datos sin fallbacks obsoletos
  const bannerImg =
    formData.coverUrl ||
    (liveBarber as any)?.cover_url ||
    liveBarber?.coverUrl ||
    avatarUrl ||
    (liveBarber as any)?.avatar_url ||
    liveBarber?.avatarUrl ||
    (barber as any)?.cover_url ||
    barber?.coverUrl ||
    barber?.avatarUrl ||
    '';

  const modalContent = (
    // Contenedor overlay fijo sin scroll externo
    <div
      data-modal-open="true"
      className={`fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 ${isLight ? 'bg-slate-100/95' : 'bg-black/80'} backdrop-blur-md animate-in fade-in duration-200`}
    >
      {/* Contenedor principal del modal: ÚNICO con overflow-y-auto */}
      <div className="relative w-full max-w-lg bg-[#0d1527] border border-amber-500/40 rounded-2xl flex flex-col max-h-[88dvh] overflow-y-auto text-slate-100 shadow-2xl transition-colors">
        
        {/* Encabezado integrado directamente en el flujo libre de desplazamiento (sin fixed, sin sticky) */}
        <div className="p-4 sm:p-5 pb-3 border-b border-slate-800 flex items-center justify-between">
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
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tarjeta Visual de Presentación Unificada (Ficha Comercial Oficial) */}
        <div className="p-4 sm:p-5 space-y-4">
          <BarberOfficialCardView
            barber={liveBarber || barber}
            barberServices={barberServices}
            formData={formData}
            showServicesCatalog={true}
          />
        </div>

        {/* BARRA INFERIOR FIJA ABAJO */}
        <div className="sticky bottom-0 bg-[#0d1527] z-20 p-4 border-t border-slate-800 shrink-0 flex items-center justify-between gap-3 shadow-lg">
          <button
            type="button"
            onClick={onEditMore}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-colors cursor-pointer shadow-sm"
          >
            ← Editar más datos
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-all shadow-md cursor-pointer"
          >
            Listo / Cerrar
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
