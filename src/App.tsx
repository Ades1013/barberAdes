/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Role, Barber, Service, Appointment, BlockedSlot, User } from './types';
import { storageService, rowToAppointment } from './services/storageService';
import { realtimeService } from './services/realtimeService';
import { authService } from './services/authService';
import { Header } from './components/Header';
import { ClientBookingFlow } from './components/client/ClientBookingFlow';
import { ClientPublicLanding } from './components/client/ClientPublicLanding';
import { BarberDashboard } from './components/barber/BarberDashboard';
import { BarberBusinessProfileModal } from './components/barber/BarberBusinessProfileModal';
import { ProfilePreviewModal } from './components/barber/ProfilePreviewModal';
import { BarberPublicCard } from './components/barber/BarberPublicCard';
import { SplitViewMode } from './components/SplitViewMode';
import { BookingConfirmationModal } from './components/client/BookingConfirmationModal';
import { ClientDataModal } from './components/client/ClientDataModal';
import { ClientProfileModal } from './components/client/ClientProfileModal';
import { AuthModal } from './components/auth/AuthModal';
import { NotificationToast } from './components/NotificationToast';
import { BarberQrModal } from './components/barber/BarberQrModal';
import { FeedbackSupportModal } from './components/barber/FeedbackSupportModal';
import { Footer } from './components/Footer';
import { Scissors, Store, QrCode, MessageSquare, Heart } from 'lucide-react';
import { supabase } from './services/supabaseClient';
import { barberService } from './services/barberService';
import { formatTimeTo12h, normalizeWorkingDays } from './utils/dateUtils';

export function App() {
  // Determine initial role synchronously on load / F5 avoiding flicker
  const [role, setRole] = useState<Role>(() => {
    if (typeof window !== 'undefined') {
      const activeRole = localStorage.getItem('barbersync_active_role');
      if (activeRole === 'barber') return 'barber';
      if (activeRole === 'client') return 'client';
      try {
        const savedUser = localStorage.getItem('barbersync_current_user_v1');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          if (
            parsed?.role === 'barber' ||
            parsed?.user_metadata?.role === 'barber' ||
            parsed?.barberId
          ) {
            return 'barber';
          }
        }
      } catch {
        // Fallback to authService
      }
    }
    const initialUser = authService.getCurrentUser();
    if (
      initialUser?.role === 'barber' ||
      (initialUser as any)?.user_metadata?.role === 'barber' ||
      initialUser?.barberId
    ) {
      return 'barber';
    }
    return 'client';
  });
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(() => !authService.getCurrentUser());
  const [splitView, setSplitView] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isBusinessProfileOpen, setIsBusinessProfileOpen] = useState<boolean>(false);
  const [isPublicProfilePreviewOpen, setIsPublicProfilePreviewOpen] = useState<boolean>(false);
  const [isDashboardModalActive, setIsDashboardModalActive] = useState<boolean>(false);
  const [hasCreatedBusiness, setHasCreatedBusiness] = useState<boolean>(true);

  // Theme State: 'dark' by default, or loaded from localStorage
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('barbersync_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  const isDarkMode = theme !== 'light';

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('barbersync_theme', next);
      return next;
    });
  };

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  // Authenticated User State
  const [currentUser, setCurrentUser] = useState<User | null>(() => authService.getCurrentUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('barbersync_last_auth_error')) {
      return true;
    }
    return authService.isPasswordRecovery();
  });
  const [isPasswordRecoveryOpen, setIsPasswordRecoveryOpen] = useState<boolean>(() => authService.isPasswordRecovery());

  // Requisito 2: Verificar negocio para barberos consultando estrictamente por user_id
  useEffect(() => {
    if (currentUser?.role === 'barber' && currentUser.id) {
      barberService.hasCreatedBusiness(currentUser.id).then((created) => {
        setHasCreatedBusiness((prev) => (prev !== created ? created : prev));
      });
    } else {
      setHasCreatedBusiness((prev) => (prev !== true ? true : prev));
    }
  }, [currentUser?.role, currentUser?.id]);

  // Core Data State: Instant synchronous cache load, then cloud reconciliation
  const [barbers, setBarbers] = useState<Barber[]>(() => storageService.getCachedBarbers());
  const [services, setServices] = useState<Service[]>(() => storageService.getServices());
  const [appointments, setAppointments] = useState<Appointment[]>(() => storageService.getCachedAppointments());
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>(() => storageService.getCachedBlockedSlots());
  const [, setLoading] = useState<boolean>(false);
  const [, setDataVersion] = useState<number>(0);

  // Requisito 2: Aislamiento absoluto de datos del barbero por user_id (prohibido fallback a barbers[0] o datos de otros locales)
  const currentBarberForUser = useMemo(() => {
    if (!currentUser || !currentUser.id) {
      return storageService.createEmptyBarberProfile('anonymous', '');
    }

    const userId = currentUser.id;
    let directSaved: any = null;
    try {
      const rawDirect = localStorage.getItem(`barbersync_saved_profile_${userId}`);
      if (rawDirect) {
        const parsed = JSON.parse(rawDirect);
        if (!parsed.userId || parsed.userId === userId || parsed.id === userId) {
          directSaved = parsed;
        }
      }
    } catch {}

    const saved =
      storageService.getBarberProfile(userId, currentUser.email) ||
      ((currentUser as any)?.barberProfile &&
      ((currentUser as any).barberProfile.userId === userId || (currentUser as any).barberProfile.id === userId)
        ? (currentUser as any).barberProfile
        : null);

    // Filtrar estrictamente por user_id === currentUser.id
    const match = barbers.find(
      (b) => b.userId === userId || b.id === userId
    );

    let resolved: any = null;
    if (match && saved) {
      resolved = {
        ...match,
        ...saved,
        id: userId,
        userId: userId,
        name: saved.name || match.name || '',
        nickname: saved.nickname || (saved as any).alias || match.nickname || (match as any).alias || '',
        alias: (saved as any).alias || saved.nickname || (match as any).alias || match.nickname || '',
        barbershopName: saved.barbershopName || (saved as any).business_name || (saved as any).shop_name || match.barbershopName || (match as any).business_name || (match as any).shop_name || '',
        business_name: (saved as any).business_name || saved.barbershopName || (match as any).business_name || match.barbershopName || '',
        shop_name: (saved as any).shop_name || saved.barbershopName || (match as any).shop_name || match.barbershopName || '',
        specialty: saved.specialty || match.specialty || '',
        address: saved.address !== undefined ? saved.address : (match.address || ''),
      };
    } else if (match) {
      resolved = match;
    } else if (saved) {
      resolved = saved;
    }

    if (directSaved && (directSaved.barbershopName || directSaved.business_name)) {
      const directAvatar = directSaved.avatarUrl || directSaved.avatar_url;
      const safeDirectAvatar = (directAvatar && typeof directAvatar === 'string' && !directAvatar.startsWith('blob:'))
        ? directAvatar
        : resolved?.avatarUrl;

      const directLinks = (Array.isArray(directSaved.social_links) && directSaved.social_links.length > 0)
        ? directSaved.social_links
        : ((Array.isArray(directSaved.socialLinks) && directSaved.socialLinks.length > 0)
          ? directSaved.socialLinks
          : (resolved?.social_links || resolved?.socialLinks || []));

      const resolvedDirectShop = directSaved.barbershopName || directSaved.business_name || directSaved.shopName || directSaved.shop_name || resolved?.barbershopName || (resolved as any)?.business_name || '';
      const resolvedDirectAlias = directSaved.nickname || directSaved.alias || resolved?.nickname || (resolved as any)?.alias || '';

      resolved = {
        ...(resolved || {}),
        ...directSaved,
        id: userId,
        userId: userId,
        name: directSaved.name || resolved?.name || '',
        nickname: resolvedDirectAlias,
        alias: resolvedDirectAlias,
        barbershopName: resolvedDirectShop,
        business_name: resolvedDirectShop,
        shop_name: resolvedDirectShop,
        specialty: directSaved.specialty !== undefined ? directSaved.specialty : (resolved?.specialty || ''),
        address: directSaved.address !== undefined ? directSaved.address : resolved?.address,
        phone: directSaved.phone !== undefined ? directSaved.phone : resolved?.phone,
        avatarUrl: safeDirectAvatar,
        avatar_url: safeDirectAvatar,
        socialLinks: directLinks,
        social_links: directLinks,
      };
    }

    const hasConfiguredBusiness = Boolean(
      resolved &&
      ((resolved.business_name && String(resolved.business_name).trim().length > 0) ||
        (resolved.barbershopName && String(resolved.barbershopName).trim().length > 0))
    );

    if (!resolved || !hasConfiguredBusiness) {
      return storageService.createEmptyBarberProfile(userId, currentUser.email);
    }

    const targetId = userId;
    const savedAvail = storageService.getBarberAvailabilitySettings(targetId, userId, currentUser.email);
    const savedServices = storageService.getServicesForBarber(targetId, userId, currentUser.email);

    const profile = resolved;
    const effWorkingHours = savedAvail?.workingHours || profile?.workingHours || profile?.schedule?.workingHours || {
      start: '09:00',
      end: '20:00',
      slotDurationMinutes: 30,
      lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
      workingDays: [1, 2, 3, 4, 5, 6],
    };

    const diasAtencion = normalizeWorkingDays(profile?.schedule?.workingDays || profile?.workingDays || profile?.workingDaysText || "Lunes a Sábado");
    const horaApertura = effWorkingHours?.start ? formatTimeTo12h(effWorkingHours.start) : (profile?.schedule?.openTime || profile?.openTime || "9:00 am");
    const horaCierre = effWorkingHours?.end ? formatTimeTo12h(effWorkingHours.end) : (profile?.schedule?.closeTime || profile?.closeTime || "8:00 pm");

    const defaultWorkingDays = [1, 2, 3, 4, 5, 6];
    const workingDaysArray = Array.isArray(effWorkingHours?.workingDays)
      ? effWorkingHours.workingDays
      : defaultWorkingDays;

    const effServices = (Array.isArray(directSaved?.services) && directSaved.services.length > 0)
      ? directSaved.services
      : ((Array.isArray(resolved?.services) && resolved.services.length > 0)
        ? resolved.services
        : (savedServices && savedServices.length > 0 ? savedServices : []));
    const effServiceIds = effServices && effServices.length > 0 ? effServices.map((s: any) => s.id) : [];

    // Dual compatibility para Redes Sociales, Avatar y Portada
    const rawLinks = (Array.isArray(resolved?.social_links) && resolved.social_links.length > 0)
      ? resolved.social_links
      : ((Array.isArray(resolved?.socialLinks) && resolved.socialLinks.length > 0) ? resolved.socialLinks : []);
    const links = [...rawLinks];
    const tempCover = typeof localStorage !== 'undefined' ? (localStorage.getItem(`barbersync_temp_cover_${userId}`) || '') : '';
    const rawCovSrc =
      (resolved as any)?.cover_url ||
      (resolved as any)?.coverUrl ||
      (resolved as any)?.avatar_url ||
      (resolved as any)?.avatar ||
      resolved?.avatarUrl ||
      (directSaved as any)?.cover_url ||
      (directSaved as any)?.coverUrl ||
      (directSaved as any)?.avatar_url ||
      (directSaved as any)?.avatar ||
      tempCover ||
      undefined;
    const coverSrc = (rawCovSrc && typeof rawCovSrc === 'string' && !rawCovSrc.startsWith('blob:')) ? rawCovSrc : undefined;
    const avatarSrc = coverSrc;

    const resolvedExceptions =
      Array.isArray((profile?.schedule as any)?.exceptions)
        ? (profile?.schedule as any).exceptions
        : Array.isArray((profile?.schedule as any)?.special_hours)
        ? (profile?.schedule as any).special_hours
        : Array.isArray(profile?.workingHours?.specialDaySchedules)
        ? profile.workingHours.specialDaySchedules
        : [];

    const resolvedRestDay =
      (profile?.schedule as any)?.rest_day !== undefined
        ? (profile?.schedule as any).rest_day
        : (savedAvail?.restDay !== undefined ? savedAvail.restDay : '0');

    const resolvedLunchBreak =
      (profile?.schedule as any)?.lunch_break ||
      profile?.workingHours?.lunchBreak ||
      effWorkingHours?.lunchBreak || { enabled: true, start: '14:00', end: '15:00' };

    const resolvedWorkDays =
      (profile?.schedule as any)?.work_days ||
      (profile?.schedule as any)?.working_days ||
      profile?.workingHours?.workingDays ||
      workingDaysArray;

    return {
      ...resolved,
      id: userId,
      userId: userId,
      services: effServices,
      serviceIds: effServiceIds,
      socialLinks: links,
      social_links: links,
      avatarUrl: avatarSrc,
      avatar_url: avatarSrc,
      coverUrl: coverSrc,
      cover_url: coverSrc,
      workingDaysText: diasAtencion,
      workingDays: diasAtencion,
      openTime: horaApertura,
      closeTime: horaCierre,
      schedule: {
        workingDays: diasAtencion,
        openTime: horaApertura,
        closeTime: horaCierre,
        exceptions: resolvedExceptions,
        special_hours: resolvedExceptions,
        rest_day: resolvedRestDay,
        work_days: resolvedWorkDays,
        working_days: resolvedWorkDays,
        lunch_break: resolvedLunchBreak,
      },
      workingHours: {
        start: effWorkingHours?.start || '09:00',
        end: effWorkingHours?.end || '20:00',
        slotDurationMinutes: effWorkingHours?.slotDurationMinutes || 30,
        lunchBreak: resolvedLunchBreak,
        workingDays: resolvedWorkDays,
        specialDaySchedules: resolvedExceptions,
      },
    } as Barber;
  }, [barbers, currentUser]);

  // Modals
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);
  const [isClientDataModalOpen, setIsClientDataModalOpen] = useState<boolean>(false);
  const [selectedClientForModal, setSelectedClientForModal] = useState<any | null>(null);
  const [isClientProfileModalOpen, setIsClientProfileModalOpen] = useState<boolean>(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [feedbackModalState, setFeedbackModalState] = useState<{
    isOpen: boolean;
    tab: 'feedback' | 'support';
  }>({ isOpen: false, tab: 'feedback' });

  // ORDEN 3: Detección centralizada de cualquier modal abierto para ocultar cabecera y bloquear scroll
  const isAnyModalOpen = Boolean(
    isAuthModalOpen ||
    isBusinessProfileOpen ||
    isPublicProfilePreviewOpen ||
    isDashboardModalActive ||
    isClientDataModalOpen ||
    isClientProfileModalOpen ||
    isQrModalOpen ||
    feedbackModalState.isOpen ||
    confirmedAppointment
  );

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isAnyModalOpen]);

  const isFetchingRef = useRef(false);

  // Load data from cache and reconcile with Supabase cloud
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Actualizar estado inmediatamente desde caché local (0ms) incluso si hay mutación en curso
      setAppointments(storageService.getCachedAppointments());
      setBarbers(storageService.getCachedBarbers());
      setServices(storageService.getServices());
      setBlockedSlots(storageService.getCachedBlockedSlots());

      // Si ya hay una consulta en curso o una mutación local, pausar consulta de red para evitar race conditions
      if (isFetchingRef.current || storageService.getIsMutating()) {
        return;
      }
      isFetchingRef.current = true;

      // 1. Cloud synchronization with Supabase - tabla public.appointments como única fuente de verdad
      const [cloudBarbers, cloudApts, cloudBlocks] = await Promise.all([
        storageService.getBarbersFromCloud(),
        storageService.getAppointments(),
        storageService.getBlockedSlots(),
      ]);

      if (storageService.getIsMutating()) {
        setAppointments(storageService.getCachedAppointments());
        return;
      }

      if (cloudBarbers && cloudBarbers.length > 0) {
        const activeUser = authService.getCurrentUser();
        const activeUserId = activeUser?.id || '';
        const localSavedRaw =
          typeof localStorage !== 'undefined' && activeUserId
            ? localStorage.getItem(`barbersync_saved_profile_${activeUserId}`)
            : null;
        const parsedLocal = localSavedRaw ? JSON.parse(localSavedRaw) : null;
        const tempCover =
          typeof localStorage !== 'undefined' && activeUserId
            ? localStorage.getItem(`barbersync_temp_cover_${activeUserId}`) || ''
            : '';

        // Sincronizar almacenamiento local de disponibilidad de forma limpia y SIN disparar upserts a la nube
        cloudBarbers.forEach((dbProfile) => {
          const dbExceptions: any[] = Array.isArray((dbProfile.schedule as any)?.exceptions)
            ? (dbProfile.schedule as any).exceptions
            : Array.isArray((dbProfile.schedule as any)?.special_hours)
            ? (dbProfile.schedule as any).special_hours
            : Array.isArray(dbProfile.workingHours?.specialDaySchedules)
            ? dbProfile.workingHours.specialDaySchedules
            : Array.isArray((dbProfile as any).working_hours?.specialDaySchedules)
            ? (dbProfile as any).working_hours.specialDaySchedules
            : [];

          const dbRestDay = (dbProfile.schedule as any)?.rest_day !== undefined
            ? (dbProfile.schedule as any).rest_day
            : '0';

          const dbWorkDays = (dbProfile.schedule as any)?.work_days ||
            (dbProfile.schedule as any)?.working_days ||
            dbProfile.workingHours?.workingDays;

          const dbLunchBreak = (dbProfile.schedule as any)?.lunch_break ||
            dbProfile.workingHours?.lunchBreak;

          const cleanWH = {
            ...(dbProfile.workingHours || {}),
            specialDaySchedules: dbExceptions,
            ...(dbWorkDays ? { workingDays: dbWorkDays } : {}),
            ...(dbLunchBreak ? { lunchBreak: dbLunchBreak } : {}),
          };

          try {
            storageService.saveBarberAvailabilitySettings({
              barberId: dbProfile.id,
              userId: dbProfile.userId,
              workingHours: cleanWH,
              restDay: dbRestDay !== undefined ? String(dbRestDay) : '0',
              email: dbProfile.email,
              persistToCloud: false,
            });

            const isLocalUser = Boolean(
              activeUserId &&
              parsedLocal &&
              (dbProfile.userId === activeUserId || dbProfile.id === activeUserId)
            );

            if (parsedLocal && isLocalUser && activeUserId) {
              if (!parsedLocal.schedule) parsedLocal.schedule = {};
              parsedLocal.schedule.exceptions = dbExceptions;
              parsedLocal.schedule.special_hours = dbExceptions;
              parsedLocal.schedule.rest_day = dbRestDay;
              parsedLocal.schedule.work_days = dbWorkDays;
              parsedLocal.schedule.lunch_break = dbLunchBreak;
              if (!parsedLocal.workingHours) parsedLocal.workingHours = {};
              parsedLocal.workingHours.specialDaySchedules = dbExceptions;
              localStorage.setItem(`barbersync_saved_profile_${activeUserId}`, JSON.stringify(parsedLocal));
            }
          } catch {}
        });

        setBarbers((prevBarbers) => {
          return cloudBarbers.map((dbProfile) => {
            const prevProfile = prevBarbers.find(
              (p) => p.id === dbProfile.id && p.userId === dbProfile.userId
            );
            const isLocalUser = Boolean(
              activeUserId &&
              parsedLocal &&
              (dbProfile.userId === activeUserId || dbProfile.id === activeUserId)
            );

            const safeCover =
              dbProfile.cover_url ||
              dbProfile.coverUrl ||
              prevProfile?.cover_url ||
              prevProfile?.coverUrl ||
              (isLocalUser ? (parsedLocal?.cover_url || parsedLocal?.coverUrl) : null) ||
              dbProfile.avatar_url ||
              dbProfile.avatarUrl ||
              prevProfile?.avatar_url ||
              prevProfile?.avatarUrl ||
              (isLocalUser ? (parsedLocal?.avatar_url || parsedLocal?.avatarUrl) : null) ||
              (isLocalUser ? tempCover : '') ||
              '';

            const safeAvatar =
              dbProfile.avatar_url ||
              dbProfile.avatarUrl ||
              prevProfile?.avatar_url ||
              prevProfile?.avatarUrl ||
              (isLocalUser ? (parsedLocal?.avatar_url || parsedLocal?.avatarUrl) : null) ||
              safeCover ||
              '';

            const dbLinks = (dbProfile as any).social_links || dbProfile.socialLinks || [];
            const prevLinks = (prevProfile as any)?.social_links || prevProfile?.socialLinks || [];
            const localLinks = parsedLocal?.social_links || parsedLocal?.socialLinks || [];

            const safeSocial =
              (Array.isArray(dbLinks) && dbLinks.length > 0)
                ? dbLinks
                : ((Array.isArray(prevLinks) && prevLinks.length > 0)
                    ? prevLinks
                    : (isLocalUser && Array.isArray(localLinks) ? localLinks : []));

            const dbExceptions: any[] = Array.isArray((dbProfile.schedule as any)?.exceptions)
              ? (dbProfile.schedule as any).exceptions
              : Array.isArray((dbProfile.schedule as any)?.special_hours)
              ? (dbProfile.schedule as any).special_hours
              : Array.isArray(dbProfile.workingHours?.specialDaySchedules)
              ? dbProfile.workingHours.specialDaySchedules
              : Array.isArray((dbProfile as any).working_hours?.specialDaySchedules)
              ? (dbProfile as any).working_hours.specialDaySchedules
              : [];

            const dbRestDay = (dbProfile.schedule as any)?.rest_day !== undefined
              ? (dbProfile.schedule as any).rest_day
              : (prevProfile?.schedule as any)?.rest_day;

            const dbWorkDays = (dbProfile.schedule as any)?.work_days ||
              (dbProfile.schedule as any)?.working_days ||
              dbProfile.workingHours?.workingDays ||
              (prevProfile?.schedule as any)?.work_days;

            const dbLunchBreak = (dbProfile.schedule as any)?.lunch_break ||
              dbProfile.workingHours?.lunchBreak ||
              (prevProfile?.schedule as any)?.lunch_break;

            const cleanWH = {
              ...(prevProfile?.workingHours || {}),
              ...(dbProfile.workingHours || {}),
              specialDaySchedules: dbExceptions,
              ...(dbWorkDays ? { workingDays: dbWorkDays } : {}),
              ...(dbLunchBreak ? { lunchBreak: dbLunchBreak } : {}),
            };

            return {
              ...dbProfile,
              cover_url: safeCover,
              coverUrl: safeCover,
              avatar_url: safeAvatar,
              avatarUrl: safeAvatar,
              social_links: safeSocial,
              socialLinks: safeSocial,
              schedule: {
                workingDays: dbProfile.schedule?.workingDays || prevProfile?.schedule?.workingDays || dbProfile.workingDaysText || 'Lunes a Sábado',
                openTime: dbProfile.schedule?.openTime || prevProfile?.schedule?.openTime || dbProfile.openTime || '09:00',
                closeTime: dbProfile.schedule?.closeTime || prevProfile?.schedule?.closeTime || dbProfile.closeTime || '20:00',
                ...(dbProfile.schedule || {}),
                exceptions: dbExceptions,
                special_hours: dbExceptions,
                rest_day: dbRestDay,
                work_days: dbWorkDays,
                working_days: dbWorkDays,
                lunch_break: dbLunchBreak,
              },
              workingHours: cleanWH,
            };
          });
        });
      }

      if (cloudApts && cloudApts.length > 0) {
        const latestLocal = storageService.getCachedAppointments();
        const finalMerged = storageService.mergeAppointments(latestLocal, cloudApts);
        setAppointments((prev) => {
          if (
            prev.length === finalMerged.length &&
            prev.every((p, idx) => p.id === finalMerged[idx]?.id && p.status === finalMerged[idx]?.status && p.date === finalMerged[idx]?.date && p.time === finalMerged[idx]?.time)
          ) {
            return prev;
          }
          return finalMerged;
        });
        storageService.saveAppointments(finalMerged);
      }

      if (cloudBlocks) {
        setBlockedSlots((prev) => {
          if (
            prev.length === cloudBlocks.length &&
            prev.every((b, idx) => b.id === cloudBlocks[idx]?.id && b.date === cloudBlocks[idx]?.date && b.time === cloudBlocks[idx]?.time)
          ) {
            return prev;
          }
          return cloudBlocks;
        });
      }
      setServices(storageService.getServices());
    } catch (err) {
      console.warn('Supabase sync warning:', err);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch from cloud - UNA SOLA VEZ al montar el componente
    loadData();

    const syncUserProfile = async (userObj: any) => {
      if (!userObj || !userObj.id) return;

      try {
        const { profile, services: userServices } = await storageService.fetchAndSyncUserProfile(userObj);
        if (profile && (profile.business_name || profile.barbershopName)) {
          setBarbers(storageService.getCachedBarbers());
          if (userServices && userServices.length > 0) {
            setServices(storageService.getServices());
          }
          setHasCreatedBusiness(true);
        } else if (userObj.role === 'barber') {
          setHasCreatedBusiness(false);
        }
      } catch (err) {
        console.warn('Error syncing user profile on load:', err);
      }
    };

    // Punto 3: Manejo de callback en la ventana principal si la URL contiene parámetros de OAuth o recuperación de contraseña
    if (typeof window !== 'undefined') {
      if (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery')) {
        authService.setPasswordRecoveryMode(true);
        setIsPasswordRecoveryOpen(true);
        setIsAuthModalOpen(true);
      }
      if (window.location.hash.includes('access_token=') || window.location.search.includes('code=')) {
        authService.refreshSession().then(() => {
          const cleanUrl = window.location.href.split('#')[0].split('?')[0];
          window.history.replaceState({}, document.title, cleanUrl);
        });
      }
    }

    // Sincronización inmediata al presionar F5 o iniciar la aplicación
    const initialActiveUser = authService.getCurrentUser();
    if (initialActiveUser) {
      syncUserProfile(initialActiveUser);
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const u = authService.getCurrentUser() || (await authService.resolveAndSyncUserRole(session.user));
        if (u?.role === 'barber') {
          setRole('barber');
          localStorage.setItem('barbersync_active_role', 'barber');
        } else if (u?.role === 'client') {
          setRole('client');
          localStorage.setItem('barbersync_active_role', 'client');
        }
      }
      setIsCheckingSession(false);
    }).catch(() => {
      setIsCheckingSession(false);
    });

    // Subscribe to auth changes and automatically adapt the view according to the user's role
    const unsubAuth = authService.subscribe((user) => {
      setCurrentUser(user);
      setIsCheckingSession(false);
      if (user) {
        if (user.role === 'barber') {
          setRole('barber');
          localStorage.setItem('barbersync_active_role', 'barber');
        } else {
          setRole('client');
          localStorage.setItem('barbersync_active_role', 'client');
        }
        syncUserProfile(user);
      } else {
        const storedRole = localStorage.getItem('barbersync_active_role') as Role | null;
        if (storedRole === 'barber') {
          setRole('barber');
        } else {
          setRole('client');
        }
      }
    });

    const unsubAuthError = authService.subscribeAuthError((errorMsg) => {
      if (errorMsg) {
        setIsCheckingSession(false);
        setIsAuthModalOpen(true);
      }
    });

    const unsubRecovery = authService.subscribeRecovery((isRecovery) => {
      setIsPasswordRecoveryOpen(isRecovery);
      if (isRecovery) {
        setIsAuthModalOpen(true);
      }
    });

    // Suscripción Realtime Instantánea de public.barbers
    const barberChannelName = `realtime-barber-changes-${Math.random().toString(36).substring(2, 8)}`;
    const barberChannel = supabase
      .channel(barberChannelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'barbers' },
        (payload) => {
          const updatedBarber: any = payload.new;
          if (updatedBarber && updatedBarber.schedule) {
            setBarbers((prev) =>
              prev.map((b) => {
                if (b.id === updatedBarber.id || b.userId === updatedBarber.user_id) {
                  const dbExceptions = Array.isArray(updatedBarber.schedule?.exceptions)
                    ? updatedBarber.schedule.exceptions
                    : Array.isArray(updatedBarber.schedule?.special_hours)
                    ? updatedBarber.schedule.special_hours
                    : Array.isArray(updatedBarber.working_hours?.specialDaySchedules)
                    ? updatedBarber.working_hours.specialDaySchedules
                    : [];

                  const updatedWH = {
                    ...(b.workingHours || {}),
                    ...(updatedBarber.working_hours || updatedBarber.schedule?.workingHours || {}),
                    specialDaySchedules: dbExceptions,
                  };
                  if (updatedBarber.schedule.work_days) updatedWH.workingDays = updatedBarber.schedule.work_days;
                  if (updatedBarber.schedule.lunch_break) updatedWH.lunchBreak = updatedBarber.schedule.lunch_break;

                  try {
                    storageService.saveBarberAvailabilitySettings({
                      barberId: updatedBarber.id,
                      userId: updatedBarber.user_id || b.userId,
                      workingHours: updatedWH,
                      restDay: String(updatedBarber.schedule.rest_day ?? '0'),
                      email: updatedBarber.email || b.email,
                      persistToCloud: false,
                    });
                  } catch {}

                  return {
                    ...b,
                    ...updatedBarber,
                    schedule: {
                      ...updatedBarber.schedule,
                      exceptions: dbExceptions,
                    },
                    workingHours: updatedWH,
                  };
                }
                return b;
              })
            );
            setDataVersion((v) => v + 1);
          }
        }
      )
      .subscribe();

    // Suscripción Realtime a public.appointments para sincronización inmediata de turnos
    const appointmentsChannelName = `realtime-app-appointments-${Math.random().toString(36).substring(2, 8)}`;
    const appointmentsChannel = supabase
      .channel(appointmentsChannelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          if (!storageService.getIsMutating() && !isFetchingRef.current) {
            loadData();
          }
        }
      )
      .subscribe();

    // Suscripción Realtime a public.blocked_slots para sincronización inmediata de bloqueos
    const blockedSlotsChannelName = `realtime-app-blocked-slots-${Math.random().toString(36).substring(2, 8)}`;
    const blockedSlotsChannel = supabase
      .channel(blockedSlotsChannelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocked_slots' },
        () => {
          if (!storageService.getIsMutating() && !isFetchingRef.current) {
            loadData();
          }
        }
      )
      .subscribe();

    // Subscribe to realtime event bus (Supabase postgres_changes + BroadcastChannel)
    const unsubscribe = realtimeService.subscribe(() => {
      setAppointments(storageService.getCachedAppointments());
      if (!storageService.getIsMutating() && !isFetchingRef.current) {
        loadData();
      }
    });

    const handleInstantAppointmentSync = () => {
      setAppointments(storageService.getCachedAppointments());
      setBarbers(storageService.getCachedBarbers());
    };
    window.addEventListener('barbersync_appointment_sync', handleInstantAppointmentSync);
    window.addEventListener('storage', handleInstantAppointmentSync);

    return () => {
      unsubAuth();
      unsubAuthError();
      unsubRecovery();
      window.removeEventListener('barbersync_appointment_sync', handleInstantAppointmentSync);
      window.removeEventListener('storage', handleInstantAppointmentSync);
      try {
        barberChannel.unsubscribe();
        supabase.removeChannel(barberChannel);
      } catch {}
      try {
        appointmentsChannel.unsubscribe();
        supabase.removeChannel(appointmentsChannel);
      } catch {}
      try {
        blockedSlotsChannel.unsubscribe();
        supabase.removeChannel(blockedSlotsChannel);
      } catch {}
      unsubscribe();
    };
  }, []); // Dependencias ESTRICTAS [] para ejecutarse UNA SOLA VEZ al montar

  // Requisito 3: Limpieza Forzada de Caché Local al Cerrar Sesión
  const handleLogout = useCallback(async () => {
    // c) Reiniciar de inmediato todos los estados globales de React a null o arreglos vacíos antes de desmontar las vistas
    setCurrentUser(null);
    setBarbers([]);
    setServices([]);
    setAppointments([]);
    setBlockedSlots([]);
    setConfirmedAppointment(null);
    setSelectedClientForModal(null);
    setIsBusinessProfileOpen(false);
    setIsPublicProfilePreviewOpen(false);
    setIsClientDataModalOpen(false);
    setIsClientProfileModalOpen(false);
    setIsQrModalOpen(false);
    setHasCreatedBusiness(false);

    // a) & b) Ejecutar await supabase.auth.signOut(), localStorage.clear() y sessionStorage.clear()
    try {
      await supabase.auth.signOut();
    } catch {}
    try {
      await authService.logout();
    } catch {}
    if (typeof window !== 'undefined') {
      try {
        localStorage.clear();
      } catch {}
      try {
        sessionStorage.clear();
      } catch {}
    }

    // Recargar catálogo público desde Supabase para la vista pública sin sesión
    loadData();
  }, [loadData]);

  // Handle sound toggling
  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    realtimeService.setSoundEnabled(nextVal);
  };

  // Reset to initial demo data if user wants a clean slate
  const handleResetData = () => {
    if (window.confirm('¿Deseas restaurar los datos de demostración a su estado inicial?')) {
      storageService.resetToDefaultData();
      loadData();
      realtimeService.emit({
        type: 'STATUS_CHANGE',
        actor: 'barber',
        payload: null,
        message: 'Datos del sistema restaurados al estado original.',
      });
    }
  };


  return (
    <div className={`relative min-h-screen ${theme === 'light' ? 'bg-[#F8FAFC] text-slate-900' : 'bg-[#0c0e12] text-slate-100'} flex flex-col font-['Plus_Jakarta_Sans',sans-serif] overflow-x-hidden w-full max-w-full transition-colors duration-200`}>
      {/* Capa de Tapiz Vintage en Mosaico (Requisito 1: /vintage-barbershop-bg.jpg, 4 col x 2 filas en PC) */}
      <div
        className="fixed inset-0 z-0 pointer-events-none select-none transition-opacity duration-300 vintage-mosaic-bg"
        style={{
          opacity: theme === 'light' ? 0.32 : 0.16,
          mixBlendMode: theme === 'light' ? 'multiply' : 'screen',
          filter: theme === 'light' ? 'brightness(0.75) contrast(1.35)' : 'brightness(1.05) contrast(1.1)',
        }}
        aria-hidden="true"
      />

      {/* Top Header Navigation */}
      <div className={`relative z-20 ${isAnyModalOpen ? 'hidden pointer-events-none' : ''}`}>
        <Header
          isAnyModalOpen={isAnyModalOpen}
          currentRole={role}
          onSelectRole={(newRole) => {
            setRole(newRole);
            if (typeof window !== 'undefined') {
              localStorage.setItem('barbersync_active_role', newRole);
            }
          }}
          splitView={splitView}
          onToggleSplitView={() => setSplitView((prev) => !prev)}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          currentUser={currentUser}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onLogout={handleLogout}
          onOpenBusinessProfile={() => setIsBusinessProfileOpen(true)}
          onOpenPublicProfilePreview={() => setIsPublicProfilePreviewOpen(true)}
          onOpenClientData={() => setIsClientDataModalOpen(true)}
          onOpenClientProfile={() => {
            setSelectedClientForModal(currentUser);
            setIsClientProfileModalOpen(true);
          }}
          onOpenMyBookings={() => {
            const isBarber =
              currentUser?.role === 'barber' ||
              (currentUser as any)?.user_metadata?.role === 'barber' ||
              Boolean(currentUser?.barberId);
            if (isBarber) {
              setIsPublicProfilePreviewOpen(true);
              return;
            }
            setRole('client');
            localStorage.setItem('barbersync_active_role', 'client');
            setTimeout(() => {
              const el = document.getElementById('tu-proxima-cita');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }}
        />
      </div>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isCheckingSession ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center min-h-[50vh] animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3 animate-pulse shadow-lg">
              <Scissors className="w-6 h-6 text-amber-400 -rotate-45" />
            </div>
            <p className="text-xs text-slate-400 font-medium">Cargando BarberAdes...</p>
          </div>
        ) : splitView ? (
          <SplitViewMode
            barbers={barbers}
            services={services}
            appointments={appointments}
            blockedSlots={blockedSlots}
            currentUser={currentUser}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onRefreshData={loadData}
            onBookingComplete={(apt) => setConfirmedAppointment(apt)}
            onExitSplitView={() => setSplitView(false)}
            onModalStateChange={setIsDashboardModalActive}
          />
        ) : role === 'client' ? (
          currentUser ? (
            <ClientBookingFlow
              barbers={barbers}
              services={services}
              appointments={appointments}
              blockedSlots={blockedSlots}
              currentUser={currentUser}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
              onRefreshData={loadData}
              onBookingComplete={(apt) => setConfirmedAppointment(apt)}
            />
          ) : (
            <ClientPublicLanding
              barbers={barbers}
              services={services}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
            />
          )
        ) : !currentUser ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto my-12 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-5 shadow-xl shadow-amber-950/20">
              <Scissors className="w-8 h-8 text-amber-400" />
            </div>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 mb-3">
              Acceso Profesional
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Gestiona tu Barbería con BarberAdes
            </h2>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              Inicia sesión o crea tu cuenta como barbero profesional para administrar tu agenda, catálogo de servicios y reservas en tiempo real.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="w-full py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-amber-500/20 cursor-pointer text-center"
              >
                Iniciar Sesión
              </button>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="w-full py-3 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-sm transition-all cursor-pointer text-center"
              >
                Crear Cuenta
              </button>
            </div>
          </div>
        ) : (
          <BarberDashboard
            barbers={barbers}
            services={services}
            appointments={appointments}
            blockedSlots={blockedSlots}
            currentUser={currentUser}
            onRefreshData={loadData}
            onOpenBusinessProfile={() => setIsBusinessProfileOpen(true)}
            onOpenClientProfile={(clientInfo) => {
              setSelectedClientForModal(clientInfo);
              setIsClientProfileModalOpen(true);
            }}
            onModalStateChange={setIsDashboardModalActive}
          />
        )}
      </main>

      {/* Requisito 1: Modal de Ficha Pública del Negocio */}
      {isPublicProfilePreviewOpen && currentBarberForUser && (
        <BarberPublicCard
          isOpen={isPublicProfilePreviewOpen}
          theme={theme}
          onClose={() => setIsPublicProfilePreviewOpen(false)}
          onEditMore={() => {
            setIsPublicProfilePreviewOpen(false);
            setIsBusinessProfileOpen(true);
          }}
          barber={currentBarberForUser}
          formData={{
            name: currentBarberForUser.name || currentUser?.name || '',
            nickname: currentBarberForUser.nickname || '',
            barbershopName: currentBarberForUser.barbershopName || (currentBarberForUser as any).business_name || (currentBarberForUser as any).shop_name || '',
            address: currentBarberForUser.address || '',
            specialty: currentBarberForUser.specialty || '',
            bio: currentBarberForUser.bio || '',
            avatarColor: currentBarberForUser.avatarColor || 'from-amber-600 to-amber-800',
            avatarUrl: currentBarberForUser.avatarUrl,
            avatar_url: (currentBarberForUser as any).avatar_url || currentBarberForUser.avatarUrl,
            workingDaysText: currentBarberForUser.workingDaysText || 'Lunes a Sábado',
            workingHoursStart: currentBarberForUser.workingHours?.start ? formatTimeTo12h(currentBarberForUser.workingHours.start) : '9:00 am',
            workingHoursEnd: currentBarberForUser.workingHours?.end ? formatTimeTo12h(currentBarberForUser.workingHours.end) : '8:00 pm',
            socialLinks: (() => {
              const links = (currentBarberForUser as any).social_links || currentBarberForUser.socialLinks || [];
              if (links.length > 0) return links;
              const direct: any[] = [];
              if (currentBarberForUser.instagram) direct.push({ id: 'sl-ig', platform: 'instagram' as const, url: currentBarberForUser.instagram });
              if (currentBarberForUser.phone) direct.push({ id: 'sl-wa', platform: 'whatsapp' as const, url: currentBarberForUser.phone });
              if (currentBarberForUser.email) direct.push({ id: 'sl-mail', platform: 'email' as const, url: currentBarberForUser.email });
              return direct;
            })(),
            social_links: (() => {
              const links = (currentBarberForUser as any).social_links || currentBarberForUser.socialLinks || [];
              return links;
            })(),
          }}
          barberServices={(() => {
            const assigned = services.filter(
              (s) =>
                s.barberId === currentBarberForUser.id ||
                (currentBarberForUser.serviceIds && currentBarberForUser.serviceIds.includes(s.id))
            );
            return assigned.length > 0 ? assigned : (currentBarberForUser.services || []);
          })()}
        />
      )}

      {/* Barber Business Profile Modal (Formulario de edición dedicado a 'Mi Negocio') */}
      {isBusinessProfileOpen && (
        <BarberBusinessProfileModal
          isOpen={isBusinessProfileOpen}
          theme={theme}
          onClose={() => setIsBusinessProfileOpen(false)}
          barber={currentBarberForUser}
          services={services}
          currentUser={currentUser}
          onRefreshData={() => {
            setBarbers(storageService.getCachedBarbers());
            setServices(storageService.getServices());
            setDataVersion((v) => v + 1);
            setHasCreatedBusiness(true);
            loadData();
          }}
        />
      )}

      {/* Confirmation Modal */}
      <BookingConfirmationModal
        appointment={confirmedAppointment}
        onClose={() => setConfirmedAppointment(null)}
        barbers={barbers}
        onViewMyBookings={() => {
          setTimeout(() => {
            const el = document.getElementById('tu-proxima-cita');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 100);
        }}
      />

      {/* Authentication & Profile Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialRecoveryMode={isPasswordRecoveryOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setIsPasswordRecoveryOpen(false);
        }}
        onSuccess={(user) => {
          setCurrentUser(user);
          if (user.role === 'barber') setRole('barber');
          else setRole('client');
        }}
      />

      {/* Client Personal Data Modal ("Mis Datos") */}
      {isClientDataModalOpen && (
        <ClientDataModal
          isOpen={isClientDataModalOpen}
          onClose={() => setIsClientDataModalOpen(false)}
          currentUser={currentUser}
          onUserDataUpdated={(updatedUser) => {
            setCurrentUser(updatedUser);
            loadData();
          }}
        />
      )}

      {/* Client Profile Modal (Ficha de Cliente para Barbero o Cliente con Bloqueo Silencioso) */}
      {isClientProfileModalOpen && (
        <ClientProfileModal
          isOpen={isClientProfileModalOpen}
          onClose={() => {
            setIsClientProfileModalOpen(false);
            setSelectedClientForModal(null);
          }}
          client={selectedClientForModal}
          appointments={appointments}
          barbers={barbers}
          services={services}
          isBarberViewing={role === 'barber'}
          currentBarberId={currentUser?.barberId || currentUser?.id || 'b-1'}
        />
      )}

      {/* Barber QR Modal */}
      {isQrModalOpen && (
        <BarberQrModal
          isOpen={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
          barber={currentBarberForUser}
        />
      )}

      {/* Feedback & Support Modal */}
      {feedbackModalState.isOpen && (
        <FeedbackSupportModal
          isOpen={feedbackModalState.isOpen}
          onClose={() => setFeedbackModalState((prev) => ({ ...prev, isOpen: false }))}
          initialTab={feedbackModalState.tab}
          userEmail={currentUser?.email}
          userRole={currentUser?.role || role}
        />
      )}

      {/* Real-Time Live Notification Toast */}
      <NotificationToast />

      {/* Footer: SIEMPRE VISIBLE y fijo en la estructura de la aplicación */}
      <Footer
        user={currentUser}
        role={role}
        isDarkMode={isDarkMode}
        theme={theme}
        isAnyModalOpen={isAnyModalOpen}
        onOpenQrModal={() => setIsQrModalOpen(true)}
        onOpenFeedback={(tab) => setFeedbackModalState({ isOpen: true, tab })}
      />
    </div>
  );
}

export default App;
