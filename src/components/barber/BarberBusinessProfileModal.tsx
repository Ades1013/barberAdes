import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Barber, Service, SocialLink, SocialPlatform } from '../../types';
import { storageService } from '../../services/storageService';
import { realtimeService } from '../../services/realtimeService';
import { formatCurrency } from '../../utils/dateUtils';
import { ProfilePreviewModal } from './ProfilePreviewModal';
import { BarberPublicCard } from './BarberPublicCard';
import { ServiceModal, SERVICE_PRICE_OPTIONS } from './ServiceModal';
import { TimePickerModal } from '../common/TimePickerModal';
import {
  X,
  Store,
  User,
  Scissors,
  Plus,
  Trash2,
  Check,
  Instagram,
  Phone,
  Building2,
  Sparkles,
  Save,
  AlertCircle,
  CheckCircle2,
  Camera,
  RotateCw,
  Loader2,
  ZoomIn,
  Move,
  Globe,
  Share2,
  MapPin,
  Star,
  Eye,
  ExternalLink,
  ChevronRight,
  GripVertical,
  Clock,
  MousePointer,
  Mail,
  Settings,
} from 'lucide-react';
import { barberService } from '../../services/barberService';
import { authService } from '../../services/authService';
import { supabase } from '../../services/supabaseClient';
import { parseWorkingDaysText, formatTimeTo12h, normalizeWorkingDays, STANDARD_WORKING_DAYS, formatScheduleDisplay } from '../../utils/dateUtils';

// Helper para convertir strings como "08:00 AM", "8:00 pm", "20:00" a formato HH:mm 24h
function normalizeTimeTo24h(input: string, fallback: string): string {
  if (!input || !input.trim()) return fallback;
  const clean = input.trim().toLowerCase();
  const isPm = clean.includes('pm') || clean.includes('p. m.') || clean.includes('p.m.');
  const isAm = clean.includes('am') || clean.includes('a. m.') || clean.includes('a.m.');

  const numbers = clean.replace(/[^0-9:]/g, '');
  if (!numbers) return fallback;

  let [hStr, mStr] = numbers.split(':');
  let h = parseInt(hStr, 10);
  let m = mStr ? parseInt(mStr, 10) : 0;
  if (isNaN(h)) return fallback;
  if (isNaN(m)) m = 0;

  if (isPm && h < 12) h += 12;
  if (isAm && h === 12) h = 0;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const WORKING_DAYS_OPTIONS = [...STANDARD_WORKING_DAYS];

export const TIME_SLOT_OPTIONS = [
  '06:00 am', '06:30 am',
  '07:00 am', '07:30 am',
  '08:00 am', '08:30 am',
  '09:00 am', '09:30 am',
  '10:00 am', '10:30 am',
  '11:00 am', '11:30 am',
  '12:00 pm', '12:30 pm',
  '01:00 pm', '01:30 pm',
  '02:00 pm', '02:30 pm',
  '03:00 pm', '03:30 pm',
  '04:00 pm', '04:30 pm',
  '05:00 pm', '05:30 pm',
  '06:00 pm', '06:30 pm',
  '07:00 pm', '07:30 pm',
  '08:00 pm', '08:30 pm',
  '09:00 pm', '09:30 pm',
  '10:00 pm',
];

export function findMatchingTimeOption(val: string, fallback: string): string {
  if (!val) return fallback;
  const norm24 = normalizeTimeTo24h(val, '');
  if (!norm24) return fallback;
  const match = TIME_SLOT_OPTIONS.find((opt) => normalizeTimeTo24h(opt, '') === norm24);
  return match || fallback;
}

interface BarberBusinessProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  barber: Barber;
  services: Service[];
  onRefreshData: () => void;
  currentUser?: import('../../types').User | null;
  isOnboarding?: boolean;
  theme?: 'light' | 'dark';
  onOpenSchedule?: () => void;
}

const AVATAR_GRADIENTS = [
  { label: 'Ámbar Clásico', value: 'from-amber-600 to-amber-800' },
  { label: 'Azul Real', value: 'from-blue-600 to-indigo-800' },
  { label: 'Esmeralda', value: 'from-emerald-600 to-teal-800' },
  { label: 'Rubí / Fuego', value: 'from-rose-600 to-red-800' },
  { label: 'Púrpura Neón', value: 'from-purple-600 to-indigo-900' },
  { label: 'Obsidiana', value: 'from-slate-700 to-slate-900' },
];

const PLATFORM_CONFIG: Record<
  SocialPlatform,
  { label: string; placeholder: string; prefix: string; color: string; icon: string }
> = {
  instagram: {
    label: 'Instagram',
    placeholder: '@tu_usuario o instagram.com/usuario',
    prefix: 'instagram.com/',
    color: 'text-pink-400 bg-pink-950/40 border-pink-800/50',
    icon: 'instagram',
  },
  tiktok: {
    label: 'TikTok',
    placeholder: '@tu_usuario o tiktok.com/@usuario',
    prefix: 'tiktok.com/@',
    color: 'text-cyan-400 bg-cyan-950/40 border-cyan-800/50',
    icon: 'tiktok',
  },
  facebook: {
    label: 'Facebook',
    placeholder: 'facebook.com/tu_pagina o @usuario',
    prefix: 'facebook.com/',
    color: 'text-blue-400 bg-blue-950/40 border-blue-800/50',
    icon: 'facebook',
  },
  twitter: {
    label: 'X (Twitter)',
    placeholder: '@tu_usuario o x.com/usuario',
    prefix: 'x.com/',
    color: 'text-slate-300 bg-slate-800/60 border-slate-700',
    icon: 'twitter',
  },
  whatsapp: {
    label: 'WhatsApp',
    placeholder: '@tu_numero o wa.me/573001234567',
    prefix: 'wa.me/',
    color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50',
    icon: 'whatsapp',
  },
  email: {
    label: 'Email',
    placeholder: 'contacto@tubarberia.com',
    prefix: 'mailto:',
    color: 'text-sky-400 bg-sky-950/50 border-sky-500/40',
    icon: 'email',
  },
  website: {
    label: 'Página Web',
    placeholder: 'https://tubarberia.com o linktr.ee/...',
    prefix: 'https://',
    color: 'text-amber-400 bg-amber-950/40 border-amber-800/50',
    icon: 'website',
  },
};

interface ProfileFormData {
  name: string;
  nickname: string;
  barbershopName: string;
  address: string;
  specialty: string;
  bio: string;
  phone: string;
  avatarColor: string;
  avatarUrl: string;
  avatar_url?: string;
  coverUrl?: string;
  cover_url?: string;
  workingDaysText: string;
  workingDays?: string;
  workingHoursStart: string;
  openTime?: string;
  workingHoursEnd: string;
  closeTime?: string;
  schedule?: {
    workingDays: string;
    openTime: string;
    closeTime: string;
  };
  socialLinks: SocialLink[];
}

export const BarberBusinessProfileModal: React.FC<BarberBusinessProfileModalProps> = ({
  isOpen,
  onClose,
  barber,
  services,
  onRefreshData,
  currentUser,
  isOnboarding,
  theme,
  onOpenSchedule,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'services'>('profile');

  // Preview Mode State (Triggered upon saving profile)
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  // Arrastre libre para reordenar enlaces de redes sociales
  const [draggedLinkIndex, setDraggedLinkIndex] = useState<number | null>(null);
  const [canDragIndex, setCanDragIndex] = useState<number | null>(null);

  const handleSocialLinkDragStart = (index: number) => {
    setDraggedLinkIndex(index);
  };

  const handleSocialLinkDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedLinkIndex === null || draggedLinkIndex === index) return;
    setFormData((prev) => {
      const updated = [...prev.socialLinks];
      const item = updated.splice(draggedLinkIndex, 1)[0];
      updated.splice(index, 0, item);
      return {
        ...prev,
        socialLinks: updated,
      };
    });
    setDraggedLinkIndex(index);
  };

  const handleSocialLinkDragEnd = () => {
    setDraggedLinkIndex(null);
    setCanDragIndex(null);
  };

  // Helper para inicializar el estado del formulario de manera limpia y estrictamente aislada por currentUser.id
  const getInitialFormData = (b: Barber): ProfileFormData => {
    const authUserId = currentUser?.id;

    // Verificar pertenencia estricta al usuario autenticado
    const belongsToAuthUser = (obj: any): boolean => {
      if (!obj || !authUserId) return false;
      const objUserId = String(obj.userId || obj.user_id || '').trim();
      const objId = String(obj.id || '').trim();
      return objUserId === authUserId || objId === authUserId;
    };

    const savedProfile =
      (authUserId ? storageService.getBarberProfile(authUserId, currentUser?.email) : null) ||
      (belongsToAuthUser((currentUser as any)?.barberProfile) ? (currentUser as any).barberProfile : null) ||
      (belongsToAuthUser(b) ? b : null);

    const hasConfiguredData = Boolean(
      savedProfile &&
      (savedProfile.barbershopName || (savedProfile as any).business_name || (savedProfile as any).shop_name)
    );

    if (savedProfile && hasConfiguredData) {
      let initialSocial: SocialLink[] = [];
      const candidateSocial =
        (savedProfile.socialLinks && savedProfile.socialLinks.length > 0 ? savedProfile.socialLinks : null) ||
        (savedProfile.social_links && savedProfile.social_links.length > 0 ? savedProfile.social_links : null) ||
        (belongsToAuthUser(b) && b.socialLinks && b.socialLinks.length > 0 ? b.socialLinks : null);

      if (candidateSocial && candidateSocial.length > 0) {
        initialSocial = candidateSocial.map((l: any) => ({ ...l })).slice(0, 6);
      } else {
        if (savedProfile.instagram) {
          initialSocial.push({ id: `sl-ig-${b.id}`, platform: 'instagram', url: savedProfile.instagram });
        }
        if (savedProfile.phone) {
          initialSocial.push({ id: `sl-wa-${b.id}`, platform: 'whatsapp', url: savedProfile.phone });
        }
      }

      const rawDias =
        (savedProfile as any)?.schedule?.workingDays ||
        (savedProfile as any)?.workingDays ||
        (savedProfile as any)?.schedule?.days ||
        savedProfile.workingDaysText ||
        'Lunes a Sábado';
      const diasAtencion = normalizeWorkingDays(rawDias);

      const horaApertura =
        (savedProfile as any)?.schedule?.openTime ||
        (savedProfile as any)?.openTime ||
        (savedProfile.workingHours?.start ? formatTimeTo12h(savedProfile.workingHours.start) : '9:00 am');

      const horaCierre =
        (savedProfile as any)?.schedule?.closeTime ||
        (savedProfile as any)?.closeTime ||
        (savedProfile.workingHours?.end ? formatTimeTo12h(savedProfile.workingHours.end) : '8:00 pm');

      return {
        name: savedProfile.name || '',
        nickname: savedProfile.nickname || (savedProfile as any).alias || (savedProfile as any).schedule?.alias || '',
        barbershopName: savedProfile.barbershopName || (savedProfile as any).business_name || (savedProfile as any).shop_name || '',
        address: savedProfile.address || '',
        specialty: savedProfile.specialty || '',
        bio: savedProfile.bio || '',
        phone: savedProfile.phone || '',
        avatarColor: savedProfile.avatarColor || AVATAR_GRADIENTS[0].value,
        avatarUrl: (savedProfile as any).cover_url || (savedProfile as any).coverUrl || savedProfile.avatarUrl || savedProfile.avatar || '',
        avatar_url: (savedProfile as any).cover_url || (savedProfile as any).coverUrl || savedProfile.avatarUrl || savedProfile.avatar || '',
        coverUrl: (savedProfile as any).cover_url || (savedProfile as any).coverUrl || savedProfile.avatarUrl || savedProfile.avatar || '',
        cover_url: (savedProfile as any).cover_url || (savedProfile as any).coverUrl || savedProfile.avatarUrl || savedProfile.avatar || '',
        workingDaysText: diasAtencion,
        workingDays: diasAtencion,
        workingHoursStart: horaApertura,
        openTime: horaApertura,
        workingHoursEnd: horaCierre,
        closeTime: horaCierre,
        schedule: {
          workingDays: diasAtencion,
          openTime: horaApertura,
          closeTime: horaCierre,
        },
        socialLinks: initialSocial,
      };
    }

    // Requisito 2b: Inicializar 100% VACÍO ('business_name: ""', 'alias: ""', 'phone: ""', 'services: []')
    // cuando es un barbero recién registrado sin datos configurados
    return {
      name: '',
      nickname: '',
      barbershopName: '',
      address: '',
      specialty: '',
      bio: '',
      phone: '',
      avatarColor: AVATAR_GRADIENTS[0].value,
      avatarUrl: '',
      avatar_url: '',
      coverUrl: '',
      cover_url: '',
      workingDaysText: 'Lunes a Sábado',
      workingDays: 'Lunes a Sábado',
      workingHoursStart: '9:00 am',
      openTime: '9:00 am',
      workingHoursEnd: '8:00 pm',
      closeTime: '8:00 pm',
      schedule: {
        workingDays: 'Lunes a Sábado',
        openTime: '9:00 am',
        closeTime: '8:00 pm',
      },
      socialLinks: [],
    };
  };

  // Requisitos 2 y 3: Estado unificado e inmutable de formData
  const [formData, setFormData] = useState<ProfileFormData>(() => getInitialFormData(barber));
  const initializedBarberIdRef = useRef<string | null>(barber.id);

  // Desestructuración limpia para compatibilidad en JSX
  const {
    name,
    nickname,
    barbershopName,
    address,
    specialty,
    bio,
    phone,
    avatarColor,
    avatarUrl,
    workingDaysText,
    workingHoursStart,
    workingHoursEnd,
    socialLinks,
  } = formData;

  // Services Management State (estrictamente aislado por currentUser.id)
  const [barberServices, setBarberServices] = useState<Service[]>(() => {
    const authUserId = currentUser?.id;
    if (!authUserId) return [];

    if (
      (barber.userId === authUserId || barber.id === authUserId) &&
      Array.isArray(barber.services) &&
      barber.services.length > 0
    ) {
      return barber.services;
    }

    const savedProfile = storageService.getBarberProfile(authUserId, currentUser?.email);
    if (savedProfile && Array.isArray(savedProfile.services) && savedProfile.services.length > 0) {
      return savedProfile.services;
    }

    return [];
  });

  // New Service Form State
  const [isAddingService, setIsAddingService] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceCategory, setNewServiceCategory] = useState<Service['category']>('corte');
  const [newServicePrice, setNewServicePrice] = useState<number>(15000);
  const [newServiceDesc, setNewServiceDesc] = useState('');

  // Editing service state
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<number>(0);
  const [editingName, setEditingName] = useState<string>('');

  // Dedicated ServiceModal sub-modal state (Requisito 4)
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [selectedServiceForEdit, setSelectedServiceForEdit] = useState<Service | null>(null);

  // TimePickerModal state para Apertura y Cierre
  const [activeTimePickerField, setActiveTimePickerField] = useState<'openTime' | 'closeTime' | null>(null);

  // Status feedback
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // File Upload & Cropper State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropperContainerRef = useRef<HTMLDivElement>(null);
  const [cropperSize, setCropperSize] = useState<{ width: number; height: number }>({ width: 400, height: 224 });
  const [rawImageToCrop, setRawImageToCrop] = useState<string | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number }>({ width: 800, height: 450 });
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [cropZoom, setCropZoom] = useState<number>(1);
  const [cropPan, setCropPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number }>({
    x: 0,
    y: 0,
    startPanX: 0,
    startPanY: 0,
  });

  // Requisito 2: Soporte global de tecla Escape (ESC) y bloqueo de scroll del fondo
  useEffect(() => {
    if (!isOpen) return;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeTimePickerField) {
          setActiveTimePickerField(null);
          return;
        }
        if (isCropperOpen) {
          setIsCropperOpen(false);
          return;
        }
        if (isServiceModalOpen) {
          setIsServiceModalOpen(false);
          setSelectedServiceForEdit(null);
          return;
        }
        if (isPreviewOpen) {
          setIsPreviewOpen(false);
          return;
        }
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
  }, [isOpen, onClose, isServiceModalOpen, isCropperOpen, isPreviewOpen, activeTimePickerField]);

  // Requisito 2a & 2b: Cargar estrictamente desde Supabase por user_id al abrir el modal
  useEffect(() => {
    if (isOpen) {
      const targetUserId = currentUser?.id || barber.userId || barber.id;
      if (initializedBarberIdRef.current !== targetUserId) {
        initializedBarberIdRef.current = targetUserId;
        setFormData(getInitialFormData(barber));

        if (currentUser?.id) {
          supabase
            .from('barbers')
            .select('*')
            .eq('user_id', currentUser.id)
            .maybeSingle()
            .then(({ data: row, error }) => {
              if (error || !row) {
                const localSaved = storageService.getBarberProfile(currentUser.id, currentUser.email);
                if (localSaved && (localSaved.business_name || localSaved.barbershopName || localSaved.address || localSaved.phone)) {
                  setFormData(getInitialFormData(localSaved as Barber));
                  if (Array.isArray(localSaved.services)) {
                    setBarberServices(localSaved.services);
                  }
                  return;
                }
                // Requisito 2b: Inicializar 100% VACÍO ('business_name: ""', 'alias: ""', 'phone: ""', 'services: []')
                setFormData({
                  name: '',
                  nickname: '',
                  barbershopName: '',
                  address: '',
                  specialty: '',
                  bio: '',
                  phone: '',
                  avatarColor: AVATAR_GRADIENTS[0].value,
                  avatarUrl: '',
                  avatar_url: '',
                  coverUrl: '',
                  cover_url: '',
                  workingDaysText: 'Lunes a Sábado',
                  workingDays: 'Lunes a Sábado',
                  workingHoursStart: '9:00 am',
                  openTime: '9:00 am',
                  workingHoursEnd: '8:00 pm',
                  closeTime: '8:00 pm',
                  schedule: {
                    workingDays: 'Lunes a Sábado',
                    openTime: '9:00 am',
                    closeTime: '8:00 pm',
                  },
                  socialLinks: [],
                });
                setBarberServices([]);
                return;
              }

              const rawBusinessName = String(
                row.business_name ||
                row.schedule?.profile_meta?.business_name ||
                row.barbershop_name ||
                row.shop_name ||
                ''
              ).trim();

              const rawAlias = String(
                row.alias ||
                row.schedule?.profile_meta?.alias ||
                row.nickname ||
                ''
              ).trim();

              const rawServices: Service[] = Array.isArray(row.services) ? row.services : [];

              if (!rawBusinessName && !rawAlias && !row.phone && rawServices.length === 0) {
                setFormData({
                  name: '',
                  nickname: '',
                  barbershopName: '',
                  address: '',
                  specialty: '',
                  bio: '',
                  phone: '',
                  avatarColor: AVATAR_GRADIENTS[0].value,
                  avatarUrl: '',
                  avatar_url: '',
                  coverUrl: '',
                  cover_url: '',
                  workingDaysText: 'Lunes a Sábado',
                  workingDays: 'Lunes a Sábado',
                  workingHoursStart: '9:00 am',
                  openTime: '9:00 am',
                  workingHoursEnd: '8:00 pm',
                  closeTime: '8:00 pm',
                  schedule: {
                    workingDays: 'Lunes a Sábado',
                    openTime: '9:00 am',
                    closeTime: '8:00 pm',
                  },
                  socialLinks: [],
                });
                setBarberServices([]);
                return;
              }

              const rowDias = normalizeWorkingDays(
                row.working_days || row.schedule?.workingDays || 'Lunes a Sábado'
              );
              const rowOpen = row.schedule?.openTime || (row.start_time ? formatTimeTo12h(row.start_time) : '9:00 am');
              const rowClose = row.schedule?.closeTime || (row.end_time ? formatTimeTo12h(row.end_time) : '8:00 pm');

              setFormData({
                name: String(row.name || '').trim(),
                nickname: rawAlias,
                barbershopName: rawBusinessName,
                address: String(row.address || '').trim(),
                specialty: String(row.specialty || '').trim(),
                bio: String(row.bio || row.description || '').trim(),
                phone: String(row.phone || row.whatsapp || '').trim(),
                avatarColor: row.avatar_color || AVATAR_GRADIENTS[0].value,
                avatarUrl: row.cover_url || row.avatar_url || '',
                avatar_url: row.cover_url || row.avatar_url || '',
                coverUrl: row.cover_url || row.avatar_url || '',
                cover_url: row.cover_url || row.avatar_url || '',
                workingDaysText: rowDias,
                workingDays: rowDias,
                workingHoursStart: rowOpen,
                openTime: rowOpen,
                workingHoursEnd: rowClose,
                closeTime: rowClose,
                schedule: {
                  workingDays: rowDias,
                  openTime: rowOpen,
                  closeTime: rowClose,
                },
                socialLinks: Array.isArray(row.social_links) ? row.social_links : [],
              });
              setBarberServices(rawServices);
            });
        }
      }
    } else {
      initializedBarberIdRef.current = null;
    }
  }, [isOpen, barber.id, currentUser, services]);

  // Actualizar dimensiones reales del visor rectangular cuando se abre el modal de recorte
  useEffect(() => {
    if (isCropperOpen && cropperContainerRef.current) {
      const w = cropperContainerRef.current.clientWidth || 400;
      const h = cropperContainerRef.current.clientHeight || 224;
      setCropperSize({ width: w, height: h });
    }
  }, [isCropperOpen]);

  // 1. Zoom por Scroll (Rueda del ratón) con cleanup estricto
  useEffect(() => {
    const el = cropperContainerRef.current;
    if (!el || !isCropperOpen) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.08 : -0.08;
      setCropZoom((prev) => Math.max(1, Math.min(3.5, Number((prev + step).toFixed(2)))));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [isCropperOpen]);

  // 1. Zoom por Teclado (+ y -) con cleanup estricto
  useEffect(() => {
    if (!isCropperOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=' || e.key === 'Add') {
        e.preventDefault();
        setCropZoom((prev) => Math.min(3.5, Number((prev + 0.1).toFixed(2))));
      } else if (e.key === '-' || e.key === '_' || e.key === 'Subtract') {
        e.preventDefault();
        setCropZoom((prev) => Math.max(1, Number((prev - 0.1).toFixed(2))));
      } else if (e.key === 'Escape') {
        setIsCropperOpen(false);
        setRawImageToCrop(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isCropperOpen]);

  // Dimensiones visuales dinámicas del visor rectangular (16:9 / h-56)
  const vW = cropperSize.width || 400;
  const vH = cropperSize.height || 224;
  const baseScale = Math.max(vW / (imageNaturalSize.width || 1), vH / (imageNaturalSize.height || 1));
  const currentScale = baseScale * cropZoom;
  const wDisp = imageNaturalSize.width * currentScale;
  const hDisp = imageNaturalSize.height * currentScale;
  const maxPanX = Math.max(0, (wDisp - vW) / 2);
  const maxPanY = Math.max(0, (hDisp - vH) / 2);

  // 3. Arrastre libre de mouse en ventana con cleanup garantizado en useEffect
  useEffect(() => {
    if (!isDraggingCrop) return;

    const onMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      const newPanX = dragStartRef.current.startPanX + deltaX;
      const newPanY = dragStartRef.current.startPanY + deltaY;

      setCropPan({
        x: Math.max(-maxPanX, Math.min(maxPanX, newPanX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, newPanY)),
      });
    };

    const onMouseUp = () => {
      setIsDraggingCrop(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingCrop, maxPanX, maxPanY]);

  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDraggingCrop(true);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      startPanX: cropPan.x,
      startPanY: cropPan.y,
    };
  };

  // 1. Soporte multitáctil para pellizcar con dos dedos (pinch-to-zoom) y arrastrar con uno
  const touchStateRef = useRef<{
    isPinching: boolean;
    initialDistance: number;
    initialZoom: number;
  }>({
    isPinching: false,
    initialDistance: 0,
    initialZoom: 1,
  });

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStateRef.current = {
        isPinching: true,
        initialDistance: dist,
        initialZoom: cropZoom,
      };
    } else if (e.touches.length === 1) {
      touchStateRef.current.isPinching = false;
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStateRef.current.isPinching) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (touchStateRef.current.initialDistance > 0) {
        const factor = dist / touchStateRef.current.initialDistance;
        const newZoom = Math.max(1, Math.min(3.5, touchStateRef.current.initialZoom * factor));
        setCropZoom(Number(newZoom.toFixed(2)));
      }
    } else if (e.touches.length === 1 && !touchStateRef.current.isPinching && isDraggingCrop) {
      const deltaX = e.touches[0].clientX - dragStartRef.current.x;
      const deltaY = e.touches[0].clientY - dragStartRef.current.y;
      const newPanX = dragStartRef.current.startPanX + deltaX;
      const newPanY = dragStartRef.current.startPanY + deltaY;
      setCropPan({
        x: Math.max(-maxPanX, Math.min(maxPanX, newPanX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, newPanY)),
      });
    }
  };

  const handleTouchEnd = () => {
    touchStateRef.current.isPinching = false;
    setIsDraggingCrop(false);
  };

  // File picker handler: Reads raw image and its natural dimensions
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFeedbackMsg({ type: 'error', text: 'Por favor selecciona un archivo de imagen válido.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const testImg = new Image();
      testImg.onload = () => {
        setImageNaturalSize({ width: testImg.naturalWidth, height: testImg.naturalHeight });
        setRawImageToCrop(result);
        setCropZoom(1);
        setCropPan({ x: 0, y: 0 });
        setIsCropperOpen(true);
      };
      testImg.src = result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Requisito 1: Conversión a Blob/WebP comprimido (0.8) y subida directa a Supabase Storage (Bucket 'barber-media')
  const handleApplyCrop = () => {
    if (!rawImageToCrop) return;
    setIsUploadingImage(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 450; // Proporción 16:9 banner panorámico comercial
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsUploadingImage(false);
        return;
      }

      // Fondo sólido oscuro
      ctx.fillStyle = '#0f121a';
      ctx.fillRect(0, 0, 800, 450);

      const targetVW = cropperSize.width || 400;
      const targetVH = cropperSize.height || 224;
      const scale = Math.max(targetVW / img.naturalWidth, targetVH / img.naturalHeight) * cropZoom;

      const cropW = Math.min(img.naturalWidth, targetVW / scale);
      const cropH = Math.min(img.naturalHeight, targetVH / scale);

      const sourceX = Math.max(
        0,
        Math.min(
          img.naturalWidth - cropW,
          (img.naturalWidth - cropW) / 2 - cropPan.x / scale
        )
      );
      const sourceY = Math.max(
        0,
        Math.min(
          img.naturalHeight - cropH,
          (img.naturalHeight - cropH) / 2 - cropPan.y / scale
        )
      );

      // Ajustar dimensiones óptimas de banner panorámico (hasta 900x500 px para máxima nitidez)
      const outWidth = Math.min(900, Math.round(cropW));
      const outHeight = Math.max(1, Math.min(500, Math.round(outWidth * (cropH / cropW))));
      canvas.width = outWidth;
      canvas.height = outHeight;
      ctx.drawImage(img, sourceX, sourceY, cropW, cropH, 0, 0, outWidth, outHeight);

      // Conversión a Blob nativo en formato WebP (calidad 0.8) y subida al bucket barber-media mediante ArrayBuffer
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setIsUploadingImage(false);
            return;
          }

          try {
            const targetUserId = currentUser?.id || barber.userId || barber.id || 'barber';

            // 1. Subida híbrida resiliente (Storage bucket o contingencia WebP directa)
            const publicUrl = await storageService.uploadBarberMedia(blob, targetUserId, 'covers');

            // 2. Asignar la URL en el estado de formData
            setFormData((prev) => ({
              ...prev,
              avatarUrl: publicUrl,
              avatar_url: publicUrl,
              coverUrl: publicUrl,
              cover_url: publicUrl,
            }));

            // 3. Sincronizar de inmediato en el objeto global del barbero en memoria
            barber.avatarUrl = publicUrl;
            (barber as any).avatar_url = publicUrl;
            barber.coverUrl = publicUrl;
            (barber as any).cover_url = publicUrl;

            // 4. Respaldo en localStorage aislado por user_id
            if (typeof localStorage !== 'undefined' && targetUserId) {
              localStorage.setItem(`barbersync_temp_cover_${targetUserId}`, publicUrl);
              try {
                const currentSaved = localStorage.getItem(`barbersync_saved_profile_${targetUserId}`);
                const parsedSaved = currentSaved ? JSON.parse(currentSaved) : {};
                localStorage.setItem(`barbersync_saved_profile_${targetUserId}`, JSON.stringify({
                  ...parsedSaved,
                  id: targetUserId,
                  userId: targetUserId,
                  avatarUrl: publicUrl,
                  avatar_url: publicUrl,
                  coverUrl: publicUrl,
                  cover_url: publicUrl,
                  updatedAt: new Date().toISOString(),
                }));
              } catch {}
            }

            // 5. Persistir de inmediato en la base de datos public.barbers
            try {
              if (targetUserId && targetUserId !== 'barber') {
                await supabase.from('barbers').upsert({
                  id: targetUserId,
                  user_id: targetUserId,
                  avatar_url: publicUrl,
                  cover_url: publicUrl,
                  updated_at: new Date().toISOString(),
                });
              }
            } catch (dbErr) {
              console.warn('Persistencia inmediata en public.barbers notice:', dbErr);
            }

            setFeedbackMsg({
              type: 'success',
              text: 'Foto de portada guardada exitosamente.',
            });
            setTimeout(() => setFeedbackMsg(null), 3000);
          } catch (err) {
            console.warn('Procesamiento de imagen completado con contingencia:', err);
          } finally {
            setIsUploadingImage(false);
            setIsCropperOpen(false);
            setRawImageToCrop(null);
          }
        },
        'image/webp',
        0.8
      );
    };
    img.src = rawImageToCrop;
  };

  // Requisito 3 & 4: Gestión inmutable y selección inteligente de redes sociales sin duplicados
  const handleAddSocialLink = () => {
    if (formData.socialLinks.length >= 6) return;
    const allPlatforms: SocialPlatform[] = ['instagram', 'whatsapp', 'tiktok', 'facebook', 'website', 'email'];
    const usedPlatforms = new Set(formData.socialLinks.map((l) => l.platform));
    const availablePlatform = allPlatforms.find((p) => !usedPlatforms.has(p)) || 'instagram';

    const newLink: SocialLink = {
      id: `sl-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      platform: availablePlatform,
      url: '',
    };
    setFormData((prev) => ({
      ...prev,
      socialLinks: [...prev.socialLinks, newLink],
    }));
  };

  const handleUpdateSocialLink = (id: string, updates: Partial<SocialLink>) => {
    setFormData((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    }));
  };

  const handleRemoveSocialLink = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.filter((l) => l.id !== id),
    }));
  };

  // Reordenar posiciones de redes sociales en formData
  const handleMoveSocialLink = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= formData.socialLinks.length) return;

    setFormData((prev) => {
      const updated = [...prev.socialLinks];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return {
        ...prev,
        socialLinks: updated,
      };
    });
  };

  // Save profile and trigger Preview Mode
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedbackMsg(null);

    // Requisito 3: Validar los 4 datos principales de la barbería (Nombre de la barbería, Nombre del barbero, Dirección y Teléfono)
    const effectivePhoneVal = (
      phone.trim() ||
      socialLinks.find((l) => l.platform === 'whatsapp')?.url?.trim() ||
      ''
    ).trim();

    const isTab1Complete = Boolean(
      name.trim().length > 0 &&
      barbershopName.trim().length > 0 &&
      address.trim().length > 0 &&
      effectivePhoneVal.length > 0
    );

    const isProfileComplete = isTab1Complete;

    try {
      const updatedServiceIds = barberServices.map((s) => s.id);
      const userEmail = (currentUser?.email || barber.email || '').toLowerCase().trim();
      const cleanSocialLinks = socialLinks
        .map((l) => ({ ...l, url: l.url.trim() }))
        .filter((l) => l.url.length > 0)
        .slice(0, 6);

      // Incluir Email en socialLinks si existe y aún no está añadido
      if (userEmail && !cleanSocialLinks.some((l) => l.platform === 'email') && cleanSocialLinks.length < 6) {
        cleanSocialLinks.push({
          id: `sl-email-${Date.now()}`,
          platform: 'email',
          url: userEmail.includes('@') && !userEmail.startsWith('mailto:') ? userEmail : userEmail.replace(/^mailto:/, ''),
        });
      }

      // Find primary instagram/phone for backward compatibility
      const primaryIg = cleanSocialLinks.find((l) => l.platform === 'instagram')?.url || '';
      const primaryPhone = cleanSocialLinks.find((l) => l.platform === 'whatsapp')?.url || phone;

      const isValidUuid = (val?: string) => Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));
      const targetBarberId =
        (currentUser?.id && isValidUuid(currentUser.id) ? currentUser.id : null) ||
        (isValidUuid(barber.userId) ? barber.userId : null) ||
        (isValidUuid(barber.id) ? barber.id : null) ||
        currentUser?.id ||
        barber.userId ||
        barber.id;

      if (!targetBarberId) {
        throw new Error('No se pudo identificar el usuario autenticado.');
      }

      const diasAtencion = formData.workingDays || formData.workingDaysText || "Lunes a Sábado";
      const horaApertura = formData.openTime || formData.workingHoursStart || "9:00 am";
      const horaCierre = formData.closeTime || formData.workingHoursEnd || "8:00 pm";

      const normStart = normalizeTimeTo24h(horaApertura, '09:00');
      const normEnd = normalizeTimeTo24h(horaCierre, '20:00');
      const workingDays = parseWorkingDaysText(diasAtencion);

      const existingWorkingHours = barber.workingHours || {};
      const lunchBreak = existingWorkingHours.lunchBreak || { enabled: true, start: '14:00', end: '15:00' };

      // Sincronización estricta de restDay: si trabaja todos los días es 'none', de lo contrario refleja el día libre
      const allWeekDays = [1, 2, 3, 4, 5, 6, 0];
      const missingFromWorking = allWeekDays.filter((d) => !workingDays.includes(d));
      let restDay = (barber as any)?.restDay || (existingWorkingHours as any)?.restDay || '0';
      if (missingFromWorking.length === 0) {
        restDay = 'none';
      } else if (restDay !== 'none' && !missingFromWorking.includes(Number(restDay))) {
        restDay = missingFromWorking.includes(0) ? '0' : String(missingFromWorking[0]);
      }

      // Limpieza automática de excepciones caducadas (date < hoy)
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const rawSpecialDays = existingWorkingHours.specialDaySchedules || (existingWorkingHours as any)?.specialDays || [];
      const specialDays = (Array.isArray(rawSpecialDays) ? rawSpecialDays : []).filter(
        (e: any) => !e || !e.date || e.date >= todayStr
      );

      const fullSchedule = {
        workingDays: diasAtencion,
        openTime: horaApertura,
        closeTime: horaCierre,
        start: normStart,
        end: normEnd,
        startTime: normStart,
        endTime: normEnd,
        lunchBreak,
        restDay,
        specialDays,
        specialDaySchedules: specialDays,
        business_name: barbershopName.trim(),
        shop_name: barbershopName.trim(),
        barbershopName: barbershopName.trim(),
        alias: nickname.trim(),
        nickname: nickname.trim(),
        rating: (barber as any).rating || 5,
        profile_meta: {
          alias: nickname.trim(),
          nickname: nickname.trim(),
          business_name: barbershopName.trim(),
          shop_name: barbershopName.trim(),
          barbershopName: barbershopName.trim(),
          rating: (barber as any).rating || 5,
        },
      };

      const profileDataLightweight = {
        name: name.trim() || barber.name,
        nickname: nickname.trim(),
        alias: nickname.trim(),
        shopName: barbershopName.trim(),
        barbershopName: barbershopName.trim(),
        business_name: barbershopName.trim(),
        shop_name: barbershopName.trim(),
        specialty: specialty.trim(),
        bio: bio.trim(),
        address: address.trim(),
        phone: primaryPhone.trim() || phone.trim(),
        socialLinks: cleanSocialLinks,
        services: barberServices,
        schedule: fullSchedule,
      };

      const profilePayload = {
        id: targetBarberId,
        userId: currentUser?.id || targetBarberId,
        email: (currentUser?.email || (currentUser as any)?.user_metadata?.email || '').toLowerCase().trim(),
        name: profileDataLightweight.name,
        nickname: profileDataLightweight.nickname,
        alias: profileDataLightweight.nickname,
        barbershopName: profileDataLightweight.shopName,
        business_name: profileDataLightweight.shopName,
        shop_name: profileDataLightweight.shopName,
        address: profileDataLightweight.address,
        specialty: profileDataLightweight.specialty,
        bio: profileDataLightweight.bio,
        phone: profileDataLightweight.phone,
        instagram: primaryIg.trim(),
        avatarColor,
        avatarUrl: avatarUrl.trim() || undefined,
        socialLinks: cleanSocialLinks,
        services: barberServices,
        serviceIds: updatedServiceIds,
        workingDaysText: diasAtencion,
        workingDays: diasAtencion,
        openTime: horaApertura,
        closeTime: horaCierre,
        schedule: fullSchedule,
        profile_data: profileDataLightweight,
        is_profile_completed: isProfileComplete,
        isProfileCompleted: isProfileComplete,
        workingHours: {
          ...existingWorkingHours,
          start: normStart,
          end: normEnd,
          slotDurationMinutes: 30,
          lunchBreak,
          restDay,
          workingDays,
          specialDaySchedules: specialDays,
        },
      };

      // 1. Persistencia permanente en storageService y localStorage aislada por user_id
      if (currentUser?.id) {
        storageService.saveBarberProfile(currentUser.id, profilePayload, currentUser.email);
        try {
          localStorage.setItem(`barbersync_profile_data_${currentUser.id}`, JSON.stringify(profileDataLightweight));
          localStorage.setItem(
            `barbersync_saved_profile_${currentUser.id}`,
            JSON.stringify({
              ...profilePayload,
              services: barberServices,
              updatedAt: new Date().toISOString(),
            })
          );
        } catch {}
      }
      storageService.saveBarberProfile(targetBarberId, profilePayload, currentUser?.email);
      try {
        localStorage.setItem(`barbersync_profile_data_${targetBarberId}`, JSON.stringify(profileDataLightweight));
        localStorage.setItem(
          `barbersync_saved_profile_${targetBarberId}`,
          JSON.stringify({
            ...profilePayload,
            services: barberServices,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch {}

      // Persistencia de completitud en localStorage
      if (isProfileComplete) {
        localStorage.setItem(`barbersync_profile_completed_${targetBarberId}`, 'true');
        if (currentUser?.id) {
          localStorage.setItem(`barbersync_profile_completed_${currentUser.id}`, 'true');
        }
      } else {
        localStorage.removeItem(`barbersync_profile_completed_${targetBarberId}`);
        if (currentUser?.id) {
          localStorage.removeItem(`barbersync_profile_completed_${currentUser.id}`);
        }
      }

      // Sincronizar de inmediato foto y nombre en la sesión activa y Header
      if (currentUser) {
        authService.updateCurrentUser({
          name: profilePayload.name,
          avatarColor: profilePayload.avatarColor,
          avatarUrl: profilePayload.avatarUrl,
          barberId: targetBarberId,
          barberProfile: profilePayload,
        });
      }

      // Guardar el perfil del barbero en la tabla public.barbers enviando SOLO columnas oficiales existentes en esquema
      const candidateCover =
        formData.cover_url ||
        formData.coverUrl ||
        formData.avatar_url ||
        formData.avatarUrl ||
        profilePayload.avatarUrl ||
        barber.coverUrl ||
        barber.cover_url ||
        barber.avatarUrl ||
        (typeof localStorage !== 'undefined' ? localStorage.getItem(`barbersync_temp_cover_${targetBarberId}`) : null) ||
        null;

      const safeAvatarUrl =
        candidateCover &&
        typeof candidateCover === 'string' &&
        !candidateCover.startsWith('blob:')
          ? candidateCover
          : null;

      const userId = currentUser?.id || targetBarberId;
      const cleanUserEmail = (currentUser?.email || barber.email || profilePayload.email || '').toLowerCase().trim();

        const targetInstagram = (cleanSocialLinks.find((l: any) => l.platform === 'instagram')?.url || '').trim();

      try {
        const barberUpsertPayload = {
          id: userId,
          user_id: userId,
          email: cleanUserEmail,
          name: name.trim() || barber.name || '',
          alias: nickname.trim(),
          business_name: barbershopName.trim(),
          specialty: specialty.trim(),
          bio: bio.trim(),
          description: bio.trim(),
          address: address.trim(),
          phone: primaryPhone.trim() || phone.trim(),
          whatsapp: primaryPhone.trim() || phone.trim(),
          instagram: targetInstagram,
          avatar_url: safeAvatarUrl,
          cover_url: safeAvatarUrl,
          services: barberServices,
          social_links: cleanSocialLinks,
          schedule: fullSchedule,
          working_days: workingDays,
          start_time: normStart,
          end_time: normEnd,
          updated_at: new Date().toISOString(),
        };

        const { error: dbErr } = await supabase.from('barbers').upsert(barberUpsertPayload);
        if (dbErr) {
          console.warn('Aviso al guardar en public.barbers:', dbErr.message);
        }
      } catch (dbErr) {
        console.warn('Excepción al guardar en public.barbers:', dbErr);
      }

      // Actualizar de inmediato el objeto global barber en el estado de React para que la Ficha Pública refleje el Email, la foto y los servicios al instante
      Object.assign(barber, {
        id: userId,
        userId: userId,
        email: cleanUserEmail,
        name: name.trim() || barber.name || '',
        nickname: nickname.trim(),
        alias: nickname.trim(),
        business_name: barbershopName.trim(),
        shop_name: barbershopName.trim(),
        barbershopName: barbershopName.trim(),
        specialty: specialty.trim(),
        bio: bio.trim(),
        address: address.trim(),
        phone: primaryPhone.trim() || phone.trim(),
        avatar_url: safeAvatarUrl,
        avatarUrl: safeAvatarUrl,
        cover_url: safeAvatarUrl,
        coverUrl: safeAvatarUrl,
        services: barberServices,
        serviceIds: updatedServiceIds,
        social_links: cleanSocialLinks,
        socialLinks: cleanSocialLinks,
        schedule: fullSchedule,
        workingDaysText: diasAtencion,
        workingDays: diasAtencion,
        openTime: horaApertura,
        closeTime: horaCierre,
        workingHours: profilePayload.workingHours,
        is_profile_completed: isProfileComplete,
        isProfileCompleted: isProfileComplete,
      });

      setFormData((prev) => ({
        ...prev,
        socialLinks: cleanSocialLinks,
        social_links: cleanSocialLinks,
        avatarUrl: safeAvatarUrl || prev.avatarUrl,
      }));

      realtimeService.emit({
        type: 'STATUS_CHANGE',
        actor: 'barber',
        payload: { barberId: targetBarberId, is_profile_completed: isProfileComplete },
        message: 'Perfil de barbería y catálogo actualizado',
      });

      onRefreshData();

      // Open the preview view immediately so the barber sees their public client card
      setIsPreviewOpen(true);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err?.message || 'Error al guardar los cambios.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Service Creation
  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim()) return;

    if (barberServices.length >= 4) {
      setFeedbackMsg({
        type: 'error',
        text: 'Límite de 4 servicios alcanzado.',
      });
      return;
    }

    const newService: Service = {
      id: `s-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      name: newServiceName.trim(),
      category: newServiceCategory,
      durationMinutes: 30, // Regla fija estricta de 30 min
      price: Number(newServicePrice) || 15000,
      description: newServiceDesc.trim() || 'Servicio profesional con acabado de máxima atención en 30 minutos.',
      barberId: barber.id,
      barbershopName: barbershopName.trim() || barber.barbershopName || '',
    };

    const nextServices = [...barberServices, newService];
    setBarberServices(nextServices);
    barber.services = nextServices;
    barber.serviceIds = nextServices.map((s) => s.id);

    await storageService.persistServicesForBarber(
      barber.id,
      currentUser?.id,
      nextServices,
      currentUser?.email || barber.email
    );

    setIsAddingService(false);
    setNewServiceName('');
    setNewServiceDesc('');
    setNewServicePrice(15000);

    onRefreshData();
    setFeedbackMsg({ type: 'success', text: `Servicio "${newService.name}" agregado exitosamente.` });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Service Deletion
  const handleDeleteService = async (serviceId: string) => {
    const nextServices = barberServices.filter((s) => s.id !== serviceId);
    setBarberServices(nextServices);
    barber.services = nextServices;
    barber.serviceIds = nextServices.map((s) => s.id);

    await storageService.persistServicesForBarber(
      barber.id,
      currentUser?.id,
      nextServices,
      currentUser?.email || barber.email
    );
    await storageService.deleteServiceFromCloud(serviceId);

    onRefreshData();
    setFeedbackMsg({ type: 'success', text: 'Servicio eliminado del catálogo.' });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Service Edit
  const handleSaveEditedService = async (serviceId: string) => {
    const nextServices = barberServices.map((s) => {
      if (s.id === serviceId) {
        return {
          ...s,
          name: editingName.trim() || s.name,
          price: Number(editingPrice) || s.price,
        };
      }
      return s;
    });
    setBarberServices(nextServices);
    barber.services = nextServices;
    barber.serviceIds = nextServices.map((s) => s.id);

    await storageService.persistServicesForBarber(
      barber.id,
      currentUser?.id,
      nextServices,
      currentUser?.email || barber.email
    );

    setEditingServiceId(null);
    onRefreshData();
    setFeedbackMsg({ type: 'success', text: 'Servicio actualizado.' });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Handler para ServiceModal (Requisito 3: persistencia inmediata en todas las capas)
  const handleSaveServiceFromModal = async (serviceData: {
    id?: string;
    name: string;
    category: Service['category'];
    price: number;
    description: string;
    durationMinutes: number;
  }) => {
    let nextServices: Service[];
    if (serviceData.id) {
      nextServices = barberServices.map((s) => {
        if (s.id === serviceData.id) {
          return {
            ...s,
            name: serviceData.name,
            category: serviceData.category,
            price: serviceData.price,
            description: serviceData.description,
            durationMinutes: 30,
          };
        }
        return s;
      });
    } else {
      if (barberServices.length >= 4) {
        setFeedbackMsg({
          type: 'error',
          text: 'Límite de 4 servicios alcanzado.',
        });
        return;
      }

      const newService: Service = {
        id: `s-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        name: serviceData.name,
        category: serviceData.category,
        durationMinutes: 30,
        price: serviceData.price,
        description: serviceData.description || 'Servicio profesional con acabado de máxima atención en 30 minutos.',
        barberId: currentUser?.id || barber.id,
        barbershopName: barbershopName.trim() || barber.barbershopName || '',
      };
      nextServices = [...barberServices, newService];
    }

    setBarberServices(nextServices);
    barber.services = nextServices;
    barber.serviceIds = nextServices.map((s) => s.id);

    await storageService.persistServicesForBarber(
      barber.id,
      currentUser?.id,
      nextServices,
      currentUser?.email || barber.email
    );

    // Requisito 4: Permanecer estrictamente dentro de la pestaña "Catálogo de Servicios"
    setActiveTab('services');
    setIsServiceModalOpen(false);
    setSelectedServiceForEdit(null);
    onRefreshData();

    setFeedbackMsg({
      type: 'success',
      text: serviceData.id ? 'Servicio actualizado correctamente.' : `Servicio "${serviceData.name}" agregado exitosamente.`
    });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Helper for rendering social platform badge/button
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

  // -------------------------------------------------------------
  // RENDER: VISTA PREVIA DE TU PERFIL (Requisito 3)
  // -------------------------------------------------------------
  if (isPreviewOpen) {
    const diasAtencion = formData.workingDays || formData.workingDaysText || "Lunes a Sábado";
    const horaApertura = formData.openTime || formData.workingHoursStart || "9:00 am";
    const horaCierre = formData.closeTime || formData.workingHoursEnd || "8:00 pm";

    const normStart = normalizeTimeTo24h(horaApertura, '09:00');
    const normEnd = normalizeTimeTo24h(horaCierre, '20:00');
    const workingDays = parseWorkingDaysText(diasAtencion);

    const schedule = {
      workingDays: diasAtencion,
      openTime: horaApertura,
      closeTime: horaCierre,
    };

    return (
      <ProfilePreviewModal
        isOpen={isPreviewOpen}
        onClose={onClose}
        theme={theme}
        onEditMore={() => setIsPreviewOpen(false)}
        barber={{
          ...barber,
          workingDaysText: diasAtencion,
          workingDays: diasAtencion,
          openTime: horaApertura,
          closeTime: horaCierre,
          schedule,
          workingHours: {
            ...(barber.workingHours || {}),
            start: normStart,
            end: normEnd,
            slotDurationMinutes: 30,
            lunchBreak: barber.workingHours?.lunchBreak || { enabled: true, start: '14:00', end: '15:00' },
            workingDays,
          },
        }}
        formData={{
          ...formData,
          workingDaysText: diasAtencion,
          workingDays: diasAtencion,
          openTime: horaApertura,
          closeTime: horaCierre,
          schedule,
        }}
        barberServices={barberServices}
      />
    );
  }

  if (!isOpen) return null;

  // -------------------------------------------------------------
  // RENDER: FORMULARIO PRINCIPAL DE EDICIÓN Y CROPPING
  // -------------------------------------------------------------
  const modalContent = (
    <div
      data-modal-open="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md"
    >
      <div className="flex flex-col max-h-[88dvh] overflow-y-auto rounded-2xl bg-[#0B0F17] border border-slate-800 w-full max-w-2xl my-auto shadow-2xl text-slate-100">
        {/* Cabecera integrada en el scroll */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/80">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-1.5 sm:gap-2">
                <span>Mis Datos & Perfil Barbero</span>
                <span className="text-[9px] sm:text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 sm:px-2 py-0.5 rounded-full uppercase">
                  Público
                </span>
              </h2>
              <p className="hidden sm:block text-[11px] text-slate-400">
                Personaliza la información que ven tus clientes y tu catálogo de servicios.
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

        {/* Tab Switcher con estado de validación */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-900/60 border-b border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Perfil</span>
            <span
              className={`w-2 h-2 rounded-full ${
                Boolean(name.trim() && nickname.trim() && barbershopName.trim() && address.trim())
                  ? 'bg-emerald-400'
                  : 'bg-amber-400/80'
              }`}
              title={
                Boolean(name.trim() && nickname.trim() && barbershopName.trim() && address.trim())
                  ? 'Pestaña 1 completa'
                  : 'Campos pendientes en Pestaña 1'
              }
            />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('services')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'services'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Servicios ({barberServices.length}/4)</span>
            <span
              className={`w-2 h-2 rounded-full ${
                barberServices.length >= 1 ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
              title={
                barberServices.length >= 1
                  ? 'Catálogo con servicios activos'
                  : 'Debes registrar al menos 1 servicio'
              }
            />
          </button>
        </div>

        {/* Feedback message */}
        {feedbackMsg && (
          <div
            className={`mx-4 sm:mx-6 mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            }`}
          >
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Cuerpo con Scroll libre desde el contenedor */}
        <div className="px-6 py-5 space-y-6">
          {activeTab === 'profile' ? (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              {/* Requisito 1: Carga y recorte de foto de perfil local (Sin URLs y sin textos técnicos) */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
                  <label className="block text-xs font-semibold text-slate-200">
                    Foto de Perfil & Avatar del Profesional
                  </label>
                  {/* Fila de Color de fondo (círculos de color) en la esquina superior derecha */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-medium">Color de fondo:</span>
                    <div className="flex items-center gap-1.5">
                      {AVATAR_GRADIENTS.map((g) => (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, avatarColor: g.value }))}
                          className={`w-5 h-5 rounded-lg bg-gradient-to-br ${g.value} transition-transform cursor-pointer ${
                            formData.avatarColor === g.value ? 'ring-2 ring-amber-400 scale-110' : 'opacity-60 hover:opacity-100'
                          }`}
                          title={g.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-5 pt-1">
                  {/* Live Avatar Preview */}
                  <div className="relative group shrink-0">
                    <div
                      className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${formData.avatarColor} flex items-center justify-center text-white font-extrabold text-2xl shadow-lg border border-white/10 overflow-hidden ring-1 ring-white/10`}
                    >
                      {formData.avatarUrl ? (
                        <img
                          key={formData.avatarUrl}
                          src={formData.avatarUrl}
                          alt={formData.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        formData.name.split(' ').map((n) => n[0]).join('').slice(0, 2)
                      )}
                    </div>
                  </div>

                  {/* Espacio liberado: Botón Seleccionar Foto de Perfil con suficiente margen y holgura */}
                  <div className="flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Seleccionar Foto de Perfil</span>
                      </button>

                      {formData.avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, avatarUrl: '' }))}
                          className="px-3.5 py-2.5 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 border border-rose-900/40 bg-slate-900 hover:bg-rose-950/30 transition-colors cursor-pointer shadow-xs"
                        >
                          Eliminar foto
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Sube una imagen desde tu dispositivo para personalizar tu ficha pública. Podrás encuadrarla y centrarla antes de guardar.
                    </p>
                  </div>
                </div>
              </div>

              {/* Basic Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nombre Completo <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Carlos Mendoza"
                    value={name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Seudónimo o Título Artístico
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. El Maestro, Fade King"
                    value={nickname}
                    onChange={(e) => setFormData((prev) => ({ ...prev, nickname: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Nombre de la Barbería</span>
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">
                      {barbershopName.length}/300
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    maxLength={300}
                    placeholder="Ej. Carlos Barbershop"
                    value={barbershopName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, barbershopName: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-xs resize-none break-words whitespace-normal leading-relaxed"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Especialidad Principal
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">
                      {specialty.length}/300
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    maxLength={300}
                    placeholder="Ej. Especialista en barbas, degradados clásicos y corte a tijera con diseño personalizado"
                    value={specialty}
                    onChange={(e) => setFormData((prev) => ({ ...prev, specialty: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-xs resize-none break-words whitespace-normal leading-relaxed"
                  />
                </div>
              </div>

              {/* Bio / Reseña */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Breve Reseña / Biografía Profesional
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {bio.length}/300
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={300}
                  placeholder="Cuenta a tus clientes sobre tus años de experiencia, técnicas favoritas o estilo de atención..."
                  value={bio}
                  onChange={(e) => setFormData((prev) => ({ ...prev, bio: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-xs resize-none break-words whitespace-normal leading-relaxed"
                />
              </div>

              {/* Requisito 2: Selector dinámico de Redes Sociales y Enlaces (Máximo 6) */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Redes Sociales y Enlaces de Contacto</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {socialLinks.length}/6 enlaces
                  </span>
                </div>

                {/* Lista de enlaces dinámicos con botones para reordenar */}
                <div className="space-y-2.5">
                  {socialLinks.map((link, index) => (
                    <div
                      key={link.id}
                      draggable={canDragIndex === index}
                      onDragStart={() => handleSocialLinkDragStart(index)}
                      onDragOver={(e) => handleSocialLinkDragOver(e, index)}
                      onDragEnd={handleSocialLinkDragEnd}
                      className={`p-2 sm:p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center gap-2 transition-all shadow-xs ${
                        draggedLinkIndex === index
                          ? 'opacity-40 border border-dashed border-amber-500/70 bg-amber-500/10'
                          : ''
                      }`}
                    >
                      {/* Fila superior en móvil / controles alineados en desktop */}
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        {/* Ícono de agarre/ordenamiento - Solo activa arrastre al hacer clic aquí */}
                        <div
                          onMouseDown={() => setCanDragIndex(index)}
                          onMouseUp={() => setCanDragIndex(null)}
                          onTouchStart={() => setCanDragIndex(index)}
                          onTouchEnd={() => setCanDragIndex(null)}
                          className="p-1.5 rounded-lg cursor-grab active:cursor-grabbing text-slate-400 hover:text-amber-400 transition-colors shrink-0 select-none"
                          title="Arrastrar para reordenar red social"
                          aria-label="Arrastrar para reordenar"
                        >
                          <GripVertical className="w-4 h-4 pointer-events-none" />
                        </div>

                        {/* Selector de plataforma - Deshabilita redes ya agregadas */}
                        <select
                          value={link.platform}
                          onChange={(e) =>
                            handleUpdateSocialLink(link.id, { platform: e.target.value as SocialPlatform })
                          }
                          className="flex-1 sm:w-36 px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 shrink-0 cursor-pointer shadow-xs"
                        >
                          {(['instagram', 'whatsapp', 'tiktok', 'facebook', 'website', 'email'] as const).map((plat) => {
                            const isAlreadyUsed = socialLinks.some((l) => l.id !== link.id && l.platform === plat);
                            return (
                              <option
                                key={plat}
                                value={plat}
                                disabled={isAlreadyUsed}
                                className={isAlreadyUsed ? 'bg-slate-900 text-slate-500' : 'bg-slate-900 text-white'}
                              >
                                {PLATFORM_CONFIG[plat]?.label || plat} {isAlreadyUsed ? '(Ya agregada)' : ''}
                              </option>
                            );
                          })}
                        </select>

                        {/* Botón eliminar enlace en móvil */}
                        <button
                          type="button"
                          onClick={() => handleRemoveSocialLink(link.id)}
                          className="sm:hidden p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors shrink-0 cursor-pointer"
                          title="Eliminar este enlace"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Campo de usuario o enlace con selección de texto completamente libre sin interferencia de arrastre */}
                      <div className="relative flex-1 min-w-0 w-full">
                        <input
                          type={link.platform === 'whatsapp' ? 'tel' : 'text'}
                          maxLength={link.platform === 'whatsapp' ? 15 : undefined}
                          placeholder={PLATFORM_CONFIG[link.platform]?.placeholder || ''}
                          value={link.url}
                          draggable={false}
                          onMouseDown={(e) => e.stopPropagation()}
                          onDragStart={(e) => e.preventDefault()}
                          onChange={(e) => {
                            const val = link.platform === 'whatsapp'
                              ? e.target.value.replace(/\D/g, '').slice(0, 15)
                              : e.target.value;
                            handleUpdateSocialLink(link.id, { url: val });
                          }}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-xs select-text cursor-text"
                          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                        />
                      </div>

                      {/* Botón eliminar enlace en desktop */}
                      <button
                        type="button"
                        onClick={() => handleRemoveSocialLink(link.id)}
                        className="hidden sm:block p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors shrink-0 cursor-pointer"
                        title="Eliminar este enlace"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Botón agregar enlace con control estricto de 6 enlaces */}
                <div className="pt-1">
                  {socialLinks.length >= 6 ? (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold text-center">
                      Límite máximo alcanzado (6 enlaces)
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAddSocialLink}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-400" />
                      <span>+ Agregar otra red social o enlace web</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Horario de Atención y Jornada Laboral vinculado con Configurar Disponibilidad */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-amber-500/30 space-y-3 shadow-xs">
                <div className="flex items-center justify-between flex-wrap gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Horario de Atención Oficial</span>
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 rounded-full">
                          Sincronizado
                        </span>
                      </h4>
                      <p className="text-xs font-semibold text-amber-300 font-mono mt-0.5">
                        {formatScheduleDisplay(
                          barber.workingHours?.workingDays || barber.workingDaysText || 'Lunes a Sábado',
                          barber.workingHours?.start || '09:00',
                          barber.workingHours?.end || '20:00'
                        )}
                      </p>
                    </div>
                  </div>
                  {onOpenSchedule && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenSchedule();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Configurar Disponibilidad</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2.5">
                  Los días laborales activos, horarios de apertura y cierre, pausas de almuerzo y excepciones se administran centralizadamente desde <strong>"Configurar Disponibilidad"</strong> y se reflejan de forma automática en tu Ficha Pública y en la agenda de turnos.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Dirección del Local / Sede <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Calle 32 # 50-24, Barrio Obrero, Medellín"
                    value={address}
                    onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Teléfono / WhatsApp de Contacto <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Ej. 3001234567"
                    value={phone}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 shadow-xs"
                  />
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Servicios Activos</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {barberServices.length}/4 servicios
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Todos los servicios tienen una duración estandarizada oficial de 30 minutos. Precios en COP (incrementos de $5.000).
                  </p>
                </div>
                <button
                  type="button"
                  disabled={barberServices.length >= 4}
                  onClick={() => {
                    if (barberServices.length >= 4) {
                      setFeedbackMsg({
                        type: 'error',
                        text: 'Límite de 4 servicios alcanzado.',
                      });
                      return;
                    }
                    setSelectedServiceForEdit(null);
                    setIsServiceModalOpen(true);
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs ${
                    barberServices.length >= 4
                      ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-md cursor-pointer'
                  }`}
                  title={
                    barberServices.length >= 4
                      ? 'Límite de 4 servicios alcanzado.'
                      : 'Nuevo Servicio'
                  }
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo Servicio</span>
                </button>
              </div>

              {/* Aviso de límite de 4 servicios alcanzado */}
              {barberServices.length >= 4 && (
                <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-3 shadow-md animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <p className="font-medium leading-relaxed">
                    Límite de 4 servicios alcanzado.
                  </p>
                </div>
              )}

              {/* Add New Service Inline Form (Fallback) */}
              {isAddingService && (
                <form
                  onSubmit={handleCreateService}
                  className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/40 space-y-3 animate-in fade-in duration-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Crear Servicio para {name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingService(false)}
                      className="text-slate-400 hover:text-white text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Nombre del Servicio *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Corte Clásico Tijera"
                        value={newServiceName}
                        onChange={(e) => setNewServiceName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Categoría</label>
                      <select
                        value={newServiceCategory}
                        onChange={(e) => setNewServiceCategory(e.target.value as any)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        <option value="corte">Corte de Cabello</option>
                        <option value="barba">Barba / Afeitado</option>
                        <option value="combo">Combo Integral</option>
                        <option value="tratamiento">Tratamiento / Cuidado</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Precio Oficial (COP) *</label>
                      <select
                        value={newServicePrice}
                        onChange={(e) => setNewServicePrice(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        {SERVICE_PRICE_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {`$${p.toLocaleString('es-CO')} COP`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Duración Oficial</label>
                      <div className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-400 font-mono flex items-center justify-between">
                        <span>30 minutos</span>
                        <span className="text-[10px] text-amber-400 font-semibold uppercase">Fijo</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">Descripción Breve</label>
                    <input
                      type="text"
                      placeholder="Ej. Incluye lavado previo, asesoría y peinado final..."
                      value={newServiceDesc}
                      onChange={(e) => setNewServiceDesc(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="pt-1 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingService(false)}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Guardar Servicio
                    </button>
                  </div>
                </form>
              )}

              {/* Service List */}
              <div className="space-y-2.5">
                {barberServices.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                    No tienes servicios registrados. Haz clic en "Nuevo Servicio" para crear tu catálogo.
                  </div>
                ) : (
                  barberServices.map((service) => {
                    const isEditing = editingServiceId === service.id;

                    if (isEditing) {
                      return (
                        <div
                          key={service.id}
                          className="p-3.5 rounded-xl bg-slate-900 border border-amber-500/50 space-y-3"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                            />
                            <select
                              value={editingPrice}
                              onChange={(e) => setEditingPrice(Number(e.target.value))}
                              className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-amber-400 font-mono font-bold cursor-pointer"
                            >
                              {SERVICE_PRICE_OPTIONS.map((p) => (
                                <option key={p} value={p}>
                                  {`$${p.toLocaleString('es-CO')} COP`}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingServiceId(null)}
                              className="text-xs text-slate-400 hover:text-white px-2 py-1"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditedService(service.id)}
                              className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded-lg"
                            >
                              Actualizar
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={service.id}
                        className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors shadow-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">{service.name}</span>
                            <span className="text-[10px] text-blue-700 bg-blue-100 border border-blue-200 dark:text-amber-400/90 dark:bg-amber-500/10 dark:border-transparent font-mono px-1.5 py-0.5 rounded">
                              30 min
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1">{service.description}</p>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                          <span className="font-mono font-bold text-sm text-blue-700 dark:text-amber-400 tabular-nums">
                            {formatCurrency(service.price)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedServiceForEdit(service);
                              setIsServiceModalOpen(true);
                            }}
                            className="text-xs text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-amber-400 px-2 py-1 rounded border border-slate-200 dark:border-transparent hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteService(service.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Eliminar servicio"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pie Fijo */}
        <div className="shrink-0 px-6 py-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 shadow-xs transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={(e) => handleSaveProfile(e as any)}
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-2 transition-colors shadow-md cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Guardando...' : 'Guardar Perfil'}</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL DE ENCUADRE Y RECORTE DE FOTO RECTANGULAR (Requisito 1) */}
      {/* ------------------------------------------------------------- */}
      {isCropperOpen && rawImageToCrop && (
        <div
          data-modal-open="true"
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl max-h-[88dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Centrar y Encuadrar Portada (16:9)</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCropperOpen(false);
                  setRawImageToCrop(null);
                }}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Visor rectangular de encuadre con esquinas redondeadas (aspect-[16/9] / h-56) */}
            <div
              ref={cropperContainerRef}
              className="relative w-full h-56 rounded-xl border-2 border-dashed border-amber-500/60 overflow-hidden bg-slate-950 shadow-inner flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none"
              onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
            >
              <img
                src={rawImageToCrop}
                alt="Para recortar"
                draggable={false}
                style={{
                  position: 'absolute',
                  width: `${wDisp}px`,
                  height: `${hDisp}px`,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  left: `${(cropperSize.width - wDisp) / 2 + cropPan.x}px`,
                  top: `${(cropperSize.height - hDisp) / 2 + cropPan.y}px`,
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />

              {/* Guía rectangular de encuadre */}
              <div className="absolute inset-2 rounded-lg border border-amber-400/40 pointer-events-none flex flex-col justify-between p-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-amber-300 bg-slate-950/80 backdrop-blur-sm border border-amber-500/30 px-2 py-0.5 rounded shadow-sm">
                    Portada / Banner Panorámico
                  </span>
                  <span className="text-[10px] font-semibold text-slate-200 bg-slate-950/85 backdrop-blur-sm border border-slate-700 px-2 py-0.5 rounded shadow-sm">
                    Zoom: {cropZoom.toFixed(1)}x
                  </span>
                </div>
              </div>
            </div>

            {/* Controles interactivos sin slider (Scroll, Teclado + / - y Pellizco) */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
              <span className="text-slate-300 flex items-center gap-1.5 flex-wrap">
                <span>🖱️ Rueda o teclas <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 font-mono text-[10px] border border-slate-700 font-bold">+</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 font-mono text-[10px] border border-slate-700 font-bold">-</kbd></span>
                <span className="text-slate-500 hidden sm:inline">· Arrastra para encuadrar</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setCropZoom(1);
                  setCropPan({ x: 0, y: 0 });
                }}
                className="text-amber-400 hover:text-amber-300 underline cursor-pointer text-[11px] font-medium"
              >
                Restablecer
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsCropperOpen(false);
                  setRawImageToCrop(null);
                }}
                disabled={isUploadingImage}
                className="px-3.5 py-2 text-xs text-slate-300 hover:text-white cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyCrop}
                disabled={isUploadingImage}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-amber-950/30 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isUploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{isUploadingImage ? 'Subiendo a Storage...' : 'Aplicar Recorte'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Modal dedicado de Creación / Edición de Servicio (Requisito 4) */}
      {isServiceModalOpen && (
        <ServiceModal
          isOpen={isServiceModalOpen}
          onClose={() => {
            setIsServiceModalOpen(false);
            setSelectedServiceForEdit(null);
          }}
          onSave={handleSaveServiceFromModal}
          initialService={selectedServiceForEdit}
          barberName={name}
        />
      )}

      {/* Selector de Hora Compacto de 3 Columnas sin Scroll */}
      {activeTimePickerField && (
        <TimePickerModal
          isOpen={Boolean(activeTimePickerField)}
          onClose={() => setActiveTimePickerField(null)}
          title={activeTimePickerField === 'openTime' ? 'Hora de Apertura' : 'Hora de Cierre'}
          value={
            activeTimePickerField === 'openTime'
              ? normalizeTimeTo24h(workingHoursStart, '08:00')
              : normalizeTimeTo24h(workingHoursEnd, '20:00')
          }
          onChange={(newTime24) => {
            const formatted12h = formatTimeTo12h(newTime24);
            if (activeTimePickerField === 'openTime') {
              setFormData((prev) => ({
                ...prev,
                workingHoursStart: formatted12h,
                openTime: formatted12h,
              }));
            } else {
              setFormData((prev) => ({
                ...prev,
                workingHoursEnd: formatted12h,
                closeTime: formatted12h,
              }));
            }
            setActiveTimePickerField(null);
          }}
        />
      )}

      {/* Requisito 3: Ficha Pública Oficial del Barbero */}
      {isPreviewOpen && (
        <BarberPublicCard
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          onEditMore={() => setIsPreviewOpen(false)}
          barber={barber}
          barberServices={barberServices}
          formData={{
            ...formData,
            avatar_url: formData.avatarUrl,
            social_links: formData.socialLinks,
          }}
          theme={theme}
        />
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
