import { Barber, Service, Appointment, BlockedSlot } from '../types';
import { INITIAL_BARBERS, INITIAL_SERVICES, getInitialAppointments } from '../data/mockData';
import { supabase } from './supabaseClient';
import { normalizeTime, normalizeTimeTo24h } from '../utils/dateUtils';

const STORAGE_KEYS = {
  BARBERS: 'barbersync_barbers_v1',
  SERVICES: 'barbersync_services_v1',
  APPOINTMENTS: 'barbersync_appointments_v1',
  BLOCKED_SLOTS: 'barbersync_blocked_slots_v1',
  UNBLOCKED_EXCEPTIONS: 'barbersync_unblocked_exceptions_v1',
  LAST_CLIENT: 'barbersync_last_client_v1',
};

export { normalizeTime, normalizeTimeTo24h } from '../utils/dateUtils';

// Row mappers to ensure compatibility with Supabase Postgres schema
function appointmentToRow(apt: Appointment) {
  const normTime = normalizeTime(apt.time || (apt as any).appointment_time || '');
  const normDate = (apt.date || (apt as any).appointment_date || '').trim();
  const effPrice = Number(apt.servicePrice ?? (apt as any).price ?? (apt as any).service_price ?? 0);
  const effCode = apt.code || (apt as any).code || '#CO-' + Math.floor(100000 + Math.random() * 900000);
  
  // Normalizar type a 'presencial' o 'virtual'
  let effType = (apt as any).type;
  if (!effType) {
    effType = apt.source === 'walk_in' ? 'presencial' : 'virtual';
  } else if (effType === 'web' || effType === 'online') {
    effType = 'virtual';
  }

  // Garantizar UUID válido para Postgres
  const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(apt.id || '');
  const validId = isValidUuid ? apt.id : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'c34ff7ab-e35d-4961-8ba8-ef523a63fbe7');

  const rawBarberId = String(apt.barberId || (apt as any).barber_id || '');
  const realBarberId = (rawBarberId && rawBarberId !== 'b-marcos' && rawBarberId !== 'barbero' && rawBarberId !== 'default')
    ? rawBarberId
    : rawBarberId;

  return {
    id: validId,
    barber_id: realBarberId,
    client_name: (apt.clientName || (apt as any).client_name || 'Cliente').trim(),
    client_phone: (apt.clientPhone || (apt as any).client_phone || 'Presencial').trim(),
    service_name: apt.serviceName || (apt as any).service_name || 'Corte Clásico',
    service_price: effPrice,
    price: effPrice,
    appointment_date: normDate,
    appointment_time: normTime,
    date: normDate,
    time: normTime,
    status: apt.status || 'confirmed',
    code: effCode,
    type: effType,
    client_id: apt.clientId || (apt as any).client_id || 'usr-guest',
    client_email: apt.clientEmail || (apt as any).client_email || null,
    notes: apt.clientNotes || (apt as any).client_notes || (apt as any).notes || null,
    duration: Number(apt.serviceDuration ?? 30),
    created_at: apt.createdAt || (apt as any).created_at || new Date().toISOString(),
  };
}

export function rowToAppointment(row: any): Appointment {
  const dateVal = row.appointment_date || row.date || '';
  const timeVal = row.appointment_time || row.time || '';
  const priceVal = Number(row.price ?? row.service_price ?? row.servicePrice ?? 0);
  
  // Normalizar type a 'presencial' o 'virtual'
  let typeVal = row.type;
  if (!typeVal) {
    typeVal = (row.source === 'walk_in' ? 'presencial' : 'virtual');
  } else if (typeVal === 'web' || typeVal === 'online') {
    typeVal = 'virtual';
  }
  const sourceVal = (typeVal === 'presencial' || row.source === 'walk_in') ? 'walk_in' : 'online';
  const codeVal = String(row.code || (row.id ? `#CO-${String(row.id).slice(-6).toUpperCase()}` : '#CO-000000'));

  const rawBarberId = String(row.barber_id || row.barberId || '');
  const unifiedBarberId = resolveUnifiedBarberId(rawBarberId);
  const cleanClientEmail = String(row.client_email || row.clientEmail || '').trim().toLowerCase() || undefined;

  const rowIdStr = String(row.id || `apt-${Date.now()}`);
  let isReviewedLocally = false;
  let isDismissedLocally = false;
  if (typeof localStorage !== 'undefined') {
    try {
      const revRaw = localStorage.getItem('barbersync_reviewed_apts');
      if (revRaw && JSON.parse(revRaw).includes(rowIdStr)) isReviewedLocally = true;
      const disRaw = localStorage.getItem('barbersync_dismissed_reviews');
      if (disRaw && JSON.parse(disRaw).includes(rowIdStr)) isDismissedLocally = true;
    } catch {}
  }

  const ratedVal = Boolean(
    row.rated === true ||
    row.reviewCompleted === true ||
    row.review_completed === true ||
    (row.rating !== undefined && row.rating !== null && Number(row.rating) > 0) ||
    isReviewedLocally
  );
  const dismissedVal = Boolean(
    row.rating_dismissed === true ||
    row.ratingDismissed === true ||
    isDismissedLocally
  );

  return {
    id: rowIdStr,
    code: codeVal,
    clientId: String(row.client_id || row.clientId || 'usr-guest'),
    client_id: String(row.client_id || row.clientId || 'usr-guest'),
    barberId: unifiedBarberId,
    barber_id: unifiedBarberId,
    barberName: String(row.barber_name || row.barberName || 'Juan Jaramillo'),
    barber_name: String(row.barber_name || row.barberName || 'Juan Jaramillo'),
    barberEmail: row.barber_email || row.barberEmail || undefined,
    barber_email: row.barber_email || row.barberEmail || undefined,
    serviceId: String(row.service_id || row.serviceId || 's-corte-clasico'),
    service_id: String(row.service_id || row.serviceId || 's-corte-clasico'),
    serviceName: String(row.service_name || row.serviceName || 'Corte'),
    service_name: String(row.service_name || row.serviceName || 'Corte'),
    servicePrice: priceVal,
    service_price: priceVal,
    price: priceVal,
    serviceDuration: Number(row.duration ?? row.service_duration ?? row.serviceDuration ?? 30),
    duration_minutes: Number(row.duration ?? row.service_duration ?? row.serviceDuration ?? 30),
    date: String(dateVal).trim(),
    appointment_date: String(dateVal).trim(),
    time: normalizeTime(String(timeVal)),
    appointment_time: normalizeTime(String(timeVal)),
    clientName: String(row.client_name || row.clientName || 'Cliente'),
    client_name: String(row.client_name || row.clientName || 'Cliente'),
    clientPhone: String(row.client_phone || row.clientPhone || ''),
    client_phone: String(row.client_phone || row.clientPhone || ''),
    clientEmail: cleanClientEmail,
    client_email: cleanClientEmail,
    clientNotes: row.notes || row.client_notes || row.clientNotes || undefined,
    client_notes: row.notes || row.client_notes || row.clientNotes || undefined,
    status: (row.status as Appointment['status']) || 'confirmed',
    cancelledBy: (row.cancelled_by || row.cancelledBy) as Appointment['cancelledBy'],
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    source: sourceVal,
    type: typeVal,
    rated: ratedVal,
    rating: row.rating !== undefined && row.rating !== null ? Number(row.rating) : undefined,
    review: row.review || row.review_comment || row.reviewComment || undefined,
    rating_dismissed: dismissedVal,
  };
}

function blockedSlotToRow(slot: BlockedSlot) {
  // Garantizar UUID válido para Postgres
  const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slot.id || '');
  const validId = isValidUuid
    ? slot.id
    : (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : undefined);

  return {
    ...(validId ? { id: validId } : {}),
    barber_id: slot.barberId,
    date: String(slot.date).trim(),
    time: String(slot.time).trim(),
    reason: slot.reason || 'Horario Bloqueado',
    created_at: slot.createdAt || new Date().toISOString(),
  };
}

function rowToBlockedSlot(row: any): BlockedSlot {
  return {
    id: String(row.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}`)),
    barberId: String(row.barber_id || row.barberId || ''),
    date: String(row.date),
    time: String(row.time),
    reason: String(row.reason || 'Horario Bloqueado'),
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  };
}

/**
 * Convierte un Blob de imagen a un string WebP Data URL ultraligero (< 25 KB, max 700x380 px, calidad 0.7)
 * para guardado directo en la base de datos PostgreSQL cuando Storage sufra errores de CORS o 502 Bad Gateway.
 */
async function compressBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        resolve('');
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxWidth = 700;
        const maxHeight = 380;
        let width = img.naturalWidth || 700;
        let height = img.naturalHeight || 380;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/webp', 0.7);
          resolve(compressed);
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

let globalIsMutating = false;

// Mapa global en memoria y localStorage para unificar IDs duplicados de barberos hacia su ID principal
const BARBER_ID_ALIAS_STORAGE_KEY = 'barbersync_barber_id_aliases_v1';
let barberIdAliasMap: Record<string, string> = (() => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BARBER_ID_ALIAS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
})();

function registerBarberIdAlias(duplicateId: string, primaryId: string) {
  if (!duplicateId || !primaryId || duplicateId === primaryId) return;
  barberIdAliasMap[duplicateId] = primaryId;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(BARBER_ID_ALIAS_STORAGE_KEY, JSON.stringify(barberIdAliasMap));
    } catch {}
  }
}

export function resolveUnifiedBarberId(barberId?: string): string {
  if (!barberId) return '';
  const clean = String(barberId).trim();
  return barberIdAliasMap[clean] || clean;
}

function getBarberCompletenessScore(b: any): number {
  let score = 0;
  const aliasVal = String(b.alias || b.nickname || (b.schedule as any)?.profile_meta?.alias || (b.schedule as any)?.alias || '').trim();
  const shopVal = String(b.business_name || b.businessName || b.barbershopName || b.shop_name || (b.schedule as any)?.profile_meta?.business_name || '').trim();
  if (aliasVal) {
    score += 100;
    if (aliasVal.toLowerCase().includes('mocha orejas')) score += 50;
  }
  if (shopVal && shopVal.toLowerCase() !== 'mi negocio') {
    score += 40;
  }
  if (b.coverUrl || b.cover_url || b.avatarUrl || b.avatar_url) score += 25;
  if (Array.isArray(b.services) && b.services.length > 0) score += 20;
  if (Array.isArray(b.socialLinks) && b.socialLinks.length > 0) score += 20;
  if (b.address && String(b.address).trim()) score += 15;
  if (b.bio && String(b.bio).trim()) score += 15;
  if (b.email && String(b.email).trim()) score += 10;
  if (b.specialty && String(b.specialty).trim()) score += 10;
  return score;
}

function deduplicateAndUnifyBarbers(rawBarbers: Barber[], cleanupDatabase = false): Barber[] {
  if (!Array.isArray(rawBarbers) || rawBarbers.length <= 1) return rawBarbers || [];

  const groups: Barber[][] = [];

  for (const b of rawBarbers) {
    if (!b) continue;
    const bId = String(b.id || '').trim().toLowerCase();
    const bUserId = String(b.userId || (b as any).user_id || '').trim().toLowerCase();
    const bEmail = String(b.email || '').trim().toLowerCase();
    const bName = String(b.name || '').trim().toLowerCase();
    const bShop = String((b as any).business_name || (b as any).businessName || b.barbershopName || (b as any).shop_name || '').trim().toLowerCase();

    const matchedGroup = groups.find((group) =>
      group.some((existing) => {
        const eId = String(existing.id || '').trim().toLowerCase();
        const eUserId = String(existing.userId || (existing as any).user_id || '').trim().toLowerCase();
        const eEmail = String(existing.email || '').trim().toLowerCase();
        const eName = String(existing.name || '').trim().toLowerCase();
        const eShop = String((existing as any).business_name || (existing as any).businessName || existing.barbershopName || (existing as any).shop_name || '').trim().toLowerCase();

        if (bId && eId && (bId === eId || bId.replace(/^b-/, '') === eId.replace(/^b-/, ''))) return true;
        if (bUserId && eUserId && bUserId === eUserId) return true;
        if (bId && eUserId && bId === eUserId) return true;
        if (bUserId && eId && bUserId === eId) return true;
        if (bEmail && eEmail && bEmail === eEmail) return true;
        if (bName && eName && bName !== 'barbero' && bName !== 'mi barbería' && bName === eName) return true;
        if (bShop && eShop && bShop !== 'mi negocio' && bShop === eShop) return true;
        return false;
      })
    );

    if (matchedGroup) {
      matchedGroup.push(b);
    } else {
      groups.push([b]);
    }
  }

  const unifiedList: Barber[] = [];

  for (const group of groups) {
    if (group.length === 1) {
      const single = group[0];
      const aliasVal = String((single as any).alias || single.nickname || (single.schedule as any)?.profile_meta?.alias || '').trim();
      const shopVal = String((single as any).business_name || (single as any).businessName || single.barbershopName || (single as any).shop_name || (single.schedule as any)?.profile_meta?.business_name || '').trim();
      unifiedList.push({
        ...single,
        alias: aliasVal,
        nickname: aliasVal,
        business_name: shopVal,
        businessName: shopVal,
        barbershopName: shopVal,
        shop_name: shopVal,
      } as Barber);
      continue;
    }

    // Ordenar de mayor a menor puntaje (conserva como principal el que tiene alias: "El Mocha Orejas")
    const sorted = [...group].sort((a, b) => getBarberCompletenessScore(b) - getBarberCompletenessScore(a));
    const primary: any = { ...sorted[0] };
    const duplicateIds: string[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const dup: any = sorted[i];
      if (dup.id && dup.id !== primary.id) {
        duplicateIds.push(dup.id);
        registerBarberIdAlias(dup.id, primary.id);
      }

      // Fusionar campos útiles que pudieran estar en la fila secundaria sin sobrescribir los del principal
      if (!primary.email && dup.email) primary.email = dup.email;
      if (!primary.userId && (dup.userId || dup.user_id)) primary.userId = dup.userId || dup.user_id;
      const pAlias = String(primary.alias || primary.nickname || primary.schedule?.profile_meta?.alias || '').trim();
      const dAlias = String(dup.alias || dup.nickname || dup.schedule?.profile_meta?.alias || '').trim();
      const bestAlias = pAlias || dAlias;
      primary.alias = bestAlias;
      primary.nickname = bestAlias;

      const pShop = String(primary.business_name || primary.businessName || primary.barbershopName || primary.shop_name || primary.schedule?.profile_meta?.business_name || '').trim();
      const dShop = String(dup.business_name || dup.businessName || dup.barbershopName || dup.shop_name || dup.schedule?.profile_meta?.business_name || '').trim();
      const bestShop = pShop || dShop;
      primary.business_name = bestShop;
      primary.businessName = bestShop;
      primary.barbershopName = bestShop;
      primary.shop_name = bestShop;

      if (!primary.specialty && dup.specialty) primary.specialty = dup.specialty;
      if (!primary.address && dup.address) primary.address = dup.address;
      if (!primary.bio && dup.bio) primary.bio = dup.bio;
      if (!primary.phone && dup.phone) primary.phone = dup.phone;
      if (!primary.coverUrl && (dup.coverUrl || dup.cover_url)) {
        primary.coverUrl = dup.coverUrl || dup.cover_url;
        primary.cover_url = primary.coverUrl;
      }
      if (!primary.avatarUrl && (dup.avatarUrl || dup.avatar_url)) {
        primary.avatarUrl = dup.avatarUrl || dup.avatar_url;
        primary.avatar_url = primary.avatarUrl;
      }
      if ((!primary.services || primary.services.length === 0) && Array.isArray(dup.services) && dup.services.length > 0) {
        primary.services = dup.services;
        primary.serviceIds = dup.services.map((s: any) => s.id);
      }
      if ((!primary.socialLinks || primary.socialLinks.length === 0) && Array.isArray(dup.socialLinks) && dup.socialLinks.length > 0) {
        primary.socialLinks = dup.socialLinks;
        primary.social_links = dup.socialLinks;
      }
    }

    primary.legacyIds = duplicateIds;
    unifiedList.push(primary as Barber);

    // Si cleanupDatabase está activo, eliminar de public.barbers las filas duplicadas y unificar citas en segundo plano
    if (cleanupDatabase && duplicateIds.length > 0) {
      (async () => {
        try {
          // 1. Reasignar citas y bloqueos que apuntaban al ID duplicado hacia el ID principal
          await supabase
            .from('appointments')
            .update({ barber_id: primary.id })
            .in('barber_id', duplicateIds);

          await supabase
            .from('blocked_slots')
            .update({ barber_id: primary.id })
            .in('barber_id', duplicateIds);

          // 2. Asegurar que la fila principal en public.barbers tenga email, alias y business_name completos
          await supabase
            .from('barbers')
            .update({
              email: primary.email || undefined,
              alias: primary.alias || '',
              business_name: primary.business_name || '',
              specialty: primary.specialty || '',
            })
            .eq('id', primary.id);

          // 3. Eliminar de public.barbers cualquier fila duplicada del mismo barbero
          await supabase
            .from('barbers')
            .delete()
            .in('id', duplicateIds);
        } catch (cleanupErr) {
          console.warn('Notice cleaning up duplicate barber rows:', cleanupErr);
        }
      })();
    }
  }

  return unifiedList;
}

export const storageService = {
  // Bandera isMutating para pausar polling y evitar race conditions
  getIsMutating(): boolean {
    return globalIsMutating;
  },
  setMutating(val: boolean): void {
    globalIsMutating = val;
  },
  resolveUnifiedBarberId(barberId?: string): string {
    return resolveUnifiedBarberId(barberId);
  },

  // Sync fallback getter for public landing / catalog
  getCachedBarbers(): Barber[] {
    const data = localStorage.getItem(STORAGE_KEYS.BARBERS);
    let list: Barber[] = [];
    if (!data) {
      list = [...INITIAL_BARBERS];
    } else {
      try {
        const parsed: Barber[] = JSON.parse(data);
        list = parsed.map((p) => {
          const init = INITIAL_BARBERS.find((b) => b.id === p.id);
          const links = (p as any).social_links || p.socialLinks || init?.socialLinks || [];
          const avUrl = (p as any).avatar_url || (p as any).avatar || p.avatarUrl || init?.avatarUrl;
          const resolvedAlias = (p as any).alias || (p as any).schedule?.profile_meta?.alias || p.nickname || init?.nickname || '';
          const resolvedShop = (p as any).business_name || (p as any).schedule?.profile_meta?.business_name || (p as any).businessName || p.barbershopName || (p as any).shop_name || init?.barbershopName || '';
          return {
            ...p,
            alias: resolvedAlias,
            nickname: resolvedAlias,
            socialLinks: links,
            social_links: links,
            avatarUrl: avUrl,
            avatar_url: avUrl,
            barbershopName: resolvedShop,
            business_name: resolvedShop,
            businessName: resolvedShop,
            shop_name: resolvedShop,
            address: p.address || init?.address || '',
            coordinates: p.coordinates || init?.coordinates,
            serviceIds: p.serviceIds || init?.serviceIds || [],
          };
        });
      } catch {
        list = [...INITIAL_BARBERS];
      }
    }

    return deduplicateAndUnifyBarbers(list, false);
  },

  /**
   * Requisito 2b: Construye un perfil de barbero 100% VACÍO para cuentas nuevas sin datos configurados
   */
  createEmptyBarberProfile(userId: string, email?: string): Barber {
    const cleanEmail = (email || '').toLowerCase().trim();
    return {
      id: userId,
      userId: userId,
      email: cleanEmail,
      name: '',
      nickname: '',
      alias: '',
      barbershopName: '',
      business_name: '',
      businessName: '',
      shop_name: '',
      address: '',
      specialty: '',
      bio: '',
      phone: '',
      instagram: '',
      avatarColor: 'from-amber-600 to-amber-800',
      avatarUrl: undefined,
      avatar_url: undefined,
      coverUrl: undefined,
      cover_url: undefined,
      rating: 5.0,
      reviewCount: 0,
      socialLinks: [],
      social_links: [],
      serviceIds: [],
      services: [],
      workingDaysText: 'Lunes a Sábado',
      workingDays: 'Lunes a Sábado',
      openTime: '9:00 am',
      closeTime: '8:00 pm',
      is_profile_completed: false,
      isProfileCompleted: false,
      schedule: {
        workingDays: 'Lunes a Sábado',
        openTime: '9:00 am',
        closeTime: '8:00 pm',
      },
      workingHours: {
        start: '09:00',
        end: '20:00',
        slotDurationMinutes: 30,
        lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
        workingDays: [1, 2, 3, 4, 5, 6],
      },
    } as any as Barber;
  },

  /**
   * Requisito 2a & 2b: Consulta estrictamente el perfil del barbero autenticado por user_id:
   * supabase.from("barbers").select("*").eq("user_id", authUser.id).single()
   * Si devuelve null o error, inicializa el estado 100% VACÍO sin usar mocks ni datos en caché de otros barberos.
   */
  async getAuthenticatedBarberProfile(authUser: { id: string; email?: string }): Promise<Barber> {
    if (!authUser || !authUser.id) {
      return this.createEmptyBarberProfile('', authUser?.email);
    }

    const cleanEmail = (authUser.email || '').toLowerCase().trim();

    try {
      const { data: row, error } = await supabase
        .from('barbers')
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (error || !row) {
        return this.createEmptyBarberProfile(authUser.id, cleanEmail);
      }

      const rawBusinessName = String(
        row.business_name ||
        row.schedule?.profile_meta?.business_name ||
        row.businessName ||
        row.shop_name ||
        row.barbershop_name ||
        row.schedule?.business_name ||
        ''
      ).trim();

      const rawAlias = String(
        row.alias ||
        row.schedule?.profile_meta?.alias ||
        row.nickname ||
        row.schedule?.alias ||
        ''
      ).trim();

      const rawName = String(row.name || '').trim();
      const rawPhone = String(row.phone || row.whatsapp || '').trim();
      const rawAddress = String(row.address || '').trim();
      const rawSpecialty = String(row.specialty || '').trim();
      const rawBio = String(row.bio || row.description || '').trim();
      const rawServices: Service[] = Array.isArray(row.services) ? row.services : [];

      const hasConfiguredBusiness = Boolean(
        row.is_profile_completed && (rawBusinessName || rawName)
      );

      if (!hasConfiguredBusiness && !rawBusinessName && !rawAlias && !rawPhone && rawServices.length === 0) {
        return this.createEmptyBarberProfile(authUser.id, cleanEmail);
      }

      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const uncleanedRowExceptions: any[] = Array.isArray(row.schedule?.exceptions)
        ? row.schedule.exceptions
        : Array.isArray(row.schedule?.special_hours)
        ? row.schedule.special_hours
        : Array.isArray(row.working_hours?.specialDaySchedules)
        ? row.working_hours.specialDaySchedules
        : [];
      const rawRowExceptions = uncleanedRowExceptions.filter(
        (e: any) => !e || !e.date || e.date >= todayStr
      );

      const effectiveWorkingHours = row.schedule?.workingHours || row.working_hours || {
        start: row.start_time || '09:00',
        end: row.end_time || '20:00',
        slotDurationMinutes: 30,
        lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
        workingDays: [1, 2, 3, 4, 5, 6],
      };
      effectiveWorkingHours.specialDaySchedules = rawRowExceptions;

      const mappedBarber: Barber = {
        id: String(row.id || authUser.id),
        userId: authUser.id,
        email: row.email || cleanEmail,
        name: rawName,
        alias: rawAlias,
        nickname: rawAlias,
        business_name: rawBusinessName,
        businessName: rawBusinessName,
        barbershopName: rawBusinessName,
        shop_name: rawBusinessName,
        address: rawAddress,
        specialty: rawSpecialty,
        bio: rawBio,
        phone: rawPhone,
        instagram: String(row.instagram || '').trim(),
        avatarColor: String(row.avatar_color || 'from-amber-600 to-amber-800'),
        avatarUrl: row.avatar_url || row.cover_url || undefined,
        avatar_url: row.avatar_url || row.cover_url || undefined,
        coverUrl: row.cover_url || row.avatar_url || undefined,
        cover_url: row.cover_url || row.avatar_url || undefined,
        rating: Number(row.rating || 5.0),
        reviewCount: Number(row.review_count ?? 0),
        socialLinks: Array.isArray(row.social_links) ? row.social_links : [],
        social_links: Array.isArray(row.social_links) ? row.social_links : [],
        services: rawServices,
        serviceIds: rawServices.map((s: any) => s.id),
        workingDaysText: row.working_days || row.schedule?.workingDays || 'Lunes a Sábado',
        workingDays: row.working_days || row.schedule?.workingDays || 'Lunes a Sábado',
        openTime: row.start_time || row.schedule?.openTime || '9:00 am',
        closeTime: row.end_time || row.schedule?.closeTime || '8:00 pm',
        is_profile_completed: hasConfiguredBusiness,
        isProfileCompleted: hasConfiguredBusiness,
        schedule: {
          ...(row.schedule || {}),
          exceptions: rawRowExceptions,
          special_hours: rawRowExceptions,
        },
        workingHours: effectiveWorkingHours,
      } as any as Barber;

      return mappedBarber;
    } catch {
      return this.createEmptyBarberProfile(authUser.id, cleanEmail);
    }
  },

  async getBarbersFromCloud(): Promise<Barber[]> {
    try {
      const { data, error } = await supabase.from('barbers').select('*');
      if (error) {
        console.warn('Supabase getBarbers error:', error.message);
        return this.getCachedBarbers();
      }
      if (data && data.length > 0) {
        const cached = this.getCachedBarbers();

        const mapped: Barber[] = data.map((row) => {
          const match = cached.find(
            (c) =>
              c.id === row.id ||
              (row.user_id && c.userId && c.userId === row.user_id)
          ) || INITIAL_BARBERS.find((b) => b.id === row.id);
          const isRowCompleted = row.is_profile_completed ?? (match as any)?.is_profile_completed ?? false;
          
          // Priorizar datos reales de public.barbers aislados por su propio row.id / row.user_id
          const savedServices = this.getServicesForBarber(String(row.id), row.user_id, row.email);
          const effectiveServices = (Array.isArray(row.services) && row.services.length > 0)
            ? row.services
            : (savedServices.length > 0 ? savedServices : (match?.services || []));
          const effectiveServiceIds = effectiveServices && effectiveServices.length > 0
            ? effectiveServices.map((s: any) => s.id)
            : (row.service_ids || match?.serviceIds || []);

          const savedAvailability = this.getBarberAvailabilitySettings(String(row.id), row.user_id, row.email);

          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

          // Supabase como ÚNICA fuente de la verdad para excepciones y disponibilidad
          const uncleanedRowExceptions: any[] = Array.isArray(row.schedule?.exceptions)
            ? row.schedule.exceptions
            : Array.isArray(row.schedule?.special_hours)
            ? row.schedule.special_hours
            : Array.isArray(row.working_hours?.specialDaySchedules)
            ? row.working_hours.specialDaySchedules
            : Array.isArray(row.schedule?.workingHours?.specialDaySchedules)
            ? row.schedule.workingHours.specialDaySchedules
            : [];

          // Limpieza automática de excepciones caducadas (date < hoy)
          const rawRowExceptions = uncleanedRowExceptions.filter(
            (e: any) => !e || !e.date || e.date >= todayStr
          );

          const effectiveWorkingHours = row.schedule?.workingHours || row.working_hours || savedAvailability?.workingHours || match?.workingHours || {
            start: '09:00',
            end: '20:00',
            slotDurationMinutes: 30,
            lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
            workingDays: [1, 2, 3, 4, 5, 6],
          };

          const effectiveLunchBreak =
            (row.schedule as any)?.lunch_break ||
            row.working_hours?.lunchBreak ||
            effectiveWorkingHours.lunchBreak;

          const effectiveWorkDays =
            (row.schedule as any)?.work_days ||
            (row.schedule as any)?.working_days ||
            row.working_hours?.workingDays ||
            effectiveWorkingHours.workingDays ||
            [1, 2, 3, 4, 5, 6];

          const allWeekDays = [1, 2, 3, 4, 5, 6, 0];
          const missingDays = Array.isArray(effectiveWorkDays)
            ? allWeekDays.filter((d) => !effectiveWorkDays.includes(d))
            : [0];

          let calculatedDefaultRest = '0';
          if (missingDays.length === 0) {
            calculatedDefaultRest = 'none';
          } else {
            calculatedDefaultRest = missingDays.includes(0) ? '0' : String(missingDays[0]);
          }

          const rawRestDay =
            (row.schedule as any)?.rest_day !== undefined
              ? (row.schedule as any).rest_day
              : (savedAvailability?.restDay !== undefined ? savedAvailability.restDay : calculatedDefaultRest);

          const effectiveRestDay =
            missingDays.length === 0
              ? 'none'
              : (rawRestDay !== 'none' && !missingDays.includes(Number(rawRestDay))
                  ? (missingDays.includes(0) ? '0' : String(missingDays[0]))
                  : rawRestDay);

          effectiveWorkingHours.specialDaySchedules = rawRowExceptions;
          if (effectiveWorkDays) effectiveWorkingHours.workingDays = effectiveWorkDays;
          if (effectiveLunchBreak) effectiveWorkingHours.lunchBreak = effectiveLunchBreak;

          const effectiveSchedule = {
            ...(match?.schedule || {}),
            ...(row.schedule || {}),
            exceptions: rawRowExceptions,
            special_hours: rawRowExceptions,
            rest_day: effectiveRestDay,
            work_days: effectiveWorkDays,
            working_days: effectiveWorkDays,
            lunch_break: effectiveLunchBreak,
          };

          // Guardar disponibilidad aislada para este barbero específico
          try {
            this.saveBarberAvailabilitySettings({
              barberId: String(row.id),
              userId: row.user_id,
              workingHours: effectiveWorkingHours,
              restDay: String(effectiveRestDay),
              email: row.email,
            });
          } catch {}

          const rowSocial = (Array.isArray(row.social_links) && row.social_links.length > 0)
            ? row.social_links
            : (Array.isArray(row.socialLinks) && row.socialLinks.length > 0 ? row.socialLinks : (match?.socialLinks || []));

          const effectiveCover = (row.cover_url && typeof row.cover_url === 'string' && !row.cover_url.startsWith('blob:'))
            ? row.cover_url
            : ((row.avatar_url && typeof row.avatar_url === 'string' && !row.avatar_url.startsWith('blob:'))
                ? row.avatar_url
                : (match?.coverUrl || match?.cover_url || ''));

          const effectiveAvatar = (row.avatar_url && typeof row.avatar_url === 'string' && !row.avatar_url.startsWith('blob:'))
            ? row.avatar_url
            : (effectiveCover || match?.avatarUrl || match?.avatar_url || '');

          const rawAlias = String(
            row.alias ||
            row.schedule?.profile_meta?.alias ||
            row.nickname ||
            row.schedule?.profile_meta?.nickname ||
            row.schedule?.alias ||
            row.schedule?.nickname ||
            ''
          ).trim();

          const rawBusinessName = String(
            row.business_name ||
            row.schedule?.profile_meta?.business_name ||
            row.businessName ||
            row.shop_name ||
            row.barbershop_name ||
            row.schedule?.profile_meta?.shop_name ||
            row.schedule?.profile_meta?.barbershopName ||
            row.schedule?.business_name ||
            row.schedule?.shop_name ||
            ''
          ).trim();

          const barberObj: any = {
            id: String(row.id),
            userId: row.user_id || match?.userId,
            user_id: row.user_id || match?.userId,
            email: row.email || match?.email || undefined,
            name: String(row.name || match?.name || ''),
            alias: rawAlias,
            nickname: rawAlias,
            avatarColor: String(row.avatar_color || match?.avatarColor || 'from-amber-600 to-amber-800'),
            avatarUrl: effectiveAvatar || undefined,
            avatar_url: effectiveAvatar || undefined,
            coverUrl: effectiveCover || undefined,
            cover_url: effectiveCover || undefined,
            rating: Number(row.rating || row.schedule?.profile_meta?.rating || row.schedule?.rating || match?.rating || 5.0),
            reviewCount: Number(row.review_count ?? row.reviews_count ?? match?.reviewCount ?? 0),
            specialty: String(row.specialty || match?.specialty || ''),
            business_name: rawBusinessName,
            businessName: rawBusinessName,
            barbershopName: rawBusinessName,
            shop_name: rawBusinessName,
            address: row.address || match?.address || '',
            coordinates: row.coordinates || match?.coordinates,
            serviceIds: effectiveServiceIds,
            services: effectiveServices,
            bio: row.bio || row.description || match?.bio || '',
            phone: row.phone || match?.phone || '',
            instagram: row.instagram || match?.instagram || '',
            socialLinks: rowSocial,
            social_links: rowSocial,
            workingDaysText: row.working_days || row.working_days_text || row.schedule?.workingDays || match?.workingDaysText || 'Lunes a Sábado',
            workingDays: row.working_days || row.working_days_text || row.schedule?.workingDays || match?.workingDays || 'Lunes a Sábado',
            is_profile_completed: isRowCompleted,
            isProfileCompleted: isRowCompleted,
            schedule: effectiveSchedule,
            workingHours: effectiveWorkingHours,
          };

          return barberObj as Barber;
        });

        const deduplicated = deduplicateAndUnifyBarbers(mapped, true);

        this.saveBarbers(deduplicated);
        return deduplicated;
      }
    } catch (err) {
      console.warn('Supabase getBarbers exception:', err);
    }
    return this.getCachedBarbers();
  },

  getBarbers(): Barber[] {
    return this.getCachedBarbers();
  },

  saveBarbers(barbers: Barber[]): void {
    const cleanList = deduplicateAndUnifyBarbers(barbers, false);
    localStorage.setItem(STORAGE_KEYS.BARBERS, JSON.stringify(cleanList));
  },

  async updateBarberWorkingHours(barberId: string, workingHours: Barber['workingHours']): Promise<Barber[]> {
    const barbers = this.getBarbers();
    const updated = barbers.map((b) => (b.id === barberId ? { ...b, workingHours } : b));
    this.saveBarbers(updated);

    try {
      const { error } = await supabase
        .from('barbers')
        .update({ working_hours: workingHours })
        .eq('id', barberId);

      if (error) {
        console.warn('Supabase updateBarberWorkingHours error:', error.message);
      }
    } catch (err) {
      console.warn('Supabase updateBarberWorkingHours exception:', err);
    }
    return updated;
  },

  async updateBarberProfile(barberId: string, updates: Partial<Barber>): Promise<Barber[]> {
    const barbers = this.getBarbers();
    const updated = barbers.map((b) => (b.id === barberId ? { ...b, ...updates } : b));
    this.saveBarbers(updated);

    try {
      const rowUpdates: any = {};
      if (updates.name) rowUpdates.name = updates.name;
      if ((updates as any).alias !== undefined || updates.nickname !== undefined) {
        const val = (updates as any).alias ?? updates.nickname ?? '';
        rowUpdates.alias = val;
        rowUpdates.nickname = val;
      }
      if ((updates as any).business_name !== undefined || updates.barbershopName !== undefined) {
        const val = (updates as any).business_name ?? updates.barbershopName ?? '';
        rowUpdates.business_name = val;
        rowUpdates.barbershop_name = val;
      }
      if (updates.avatarColor) rowUpdates.avatar_color = updates.avatarColor;
      if (updates.avatarUrl !== undefined) rowUpdates.avatar_url = updates.avatarUrl;
      if (updates.bio !== undefined) rowUpdates.bio = updates.bio;
      if (updates.phone !== undefined) rowUpdates.phone = updates.phone;
      if (updates.instagram !== undefined) rowUpdates.instagram = updates.instagram;
      if (updates.socialLinks !== undefined) rowUpdates.social_links = updates.socialLinks;
      if (updates.specialty !== undefined) rowUpdates.specialty = updates.specialty;
      if (updates.serviceIds !== undefined) rowUpdates.service_ids = updates.serviceIds;
      if (updates.address !== undefined) rowUpdates.address = updates.address;
      if (updates.workingDaysText !== undefined) rowUpdates.working_days_text = updates.workingDaysText;
      if (updates.workingHours !== undefined) rowUpdates.working_hours = updates.workingHours;
      if (updates.is_profile_completed !== undefined || updates.isProfileCompleted !== undefined) {
        rowUpdates.is_profile_completed = updates.is_profile_completed ?? updates.isProfileCompleted;
      }

      await supabase.from('barbers').update(rowUpdates).eq('id', barberId);
    } catch (err) {
      console.warn('Supabase updateBarberProfile exception:', err);
    }

    return updated;
  },

  saveBarberProfile(identifier: string, profileData: Partial<Barber> & Record<string, any>, email?: string): void {
    if (!identifier && !email) return;
    const targetId = identifier || profileData.id || profileData.userId;
    const targetEmail = (email || profileData.email || '').toLowerCase().trim();

    const safeProfileData = {
      ...profileData,
      id: profileData.id || targetId,
      userId: profileData.userId || (profileData as any).user_id || targetId,
      user_id: (profileData as any).user_id || profileData.userId || targetId,
    };

    // 1. Save in localStorage strictly scoped by targetId / email
    if (targetId) {
      localStorage.setItem(`barbersync_barber_profile_${targetId}`, JSON.stringify(safeProfileData));
      localStorage.setItem(`barbersync_saved_profile_${targetId}`, JSON.stringify(safeProfileData));
      localStorage.setItem(`barbersync_has_business_${targetId}`, 'true');
    }
    if (targetEmail) {
      localStorage.setItem(`barbersync_barber_profile_${targetEmail}`, JSON.stringify(safeProfileData));
      localStorage.setItem(`barbersync_has_business_${targetEmail}`, 'true');
    }
    if (profileData.id && profileData.id !== targetId) {
      localStorage.setItem(`barbersync_barber_profile_${profileData.id}`, JSON.stringify(safeProfileData));
      localStorage.setItem(`barbersync_saved_profile_${profileData.id}`, JSON.stringify(safeProfileData));
      localStorage.setItem(`barbersync_has_business_${profileData.id}`, 'true');
    }

    const isCompleted = profileData.is_profile_completed ?? profileData.isProfileCompleted ?? true;
    if (isCompleted) {
      if (targetId) localStorage.setItem(`barbersync_profile_completed_${targetId}`, 'true');
      if (targetEmail) localStorage.setItem(`barbersync_profile_completed_${targetEmail}`, 'true');
      if (profileData.id) localStorage.setItem(`barbersync_profile_completed_${profileData.id}`, 'true');
    }

    // 2. If profile contains services, save them in services storage
    if (Array.isArray(profileData.services) && profileData.services.length > 0) {
      const existingServices = this.getServices();
      const updatedServices = [...existingServices];
      profileData.services.forEach((newS: Service) => {
        const idx = updatedServices.findIndex((s) => s.id === newS.id);
        if (idx >= 0) {
          updatedServices[idx] = newS;
        } else {
          updatedServices.push(newS);
        }
      });
      this.saveServices(updatedServices);
    }

    // 3. Update cached barbers list strictly matching by id / userId
    const barbers = this.getBarbers();
    const index = barbers.findIndex(
      (b) =>
        (targetId && (b.id === targetId || b.userId === targetId)) ||
        (profileData.id && b.id === profileData.id)
    );
    const existing = index >= 0 ? barbers[index] : ({} as any);
    const links = (profileData as any).social_links || profileData.socialLinks || (existing as any).social_links || existing.socialLinks || [];
    const avUrl = (profileData as any).avatar_url || profileData.avatarUrl || (profileData as any).avatar || (existing as any).avatar_url || existing.avatarUrl;
    const resolvedShop = profileData.barbershopName || (profileData as any).business_name || (profileData as any).shop_name || existing.barbershopName || (existing as any).business_name || '';
    const resolvedAlias = profileData.nickname !== undefined ? profileData.nickname : ((profileData as any).alias !== undefined ? (profileData as any).alias : (existing.nickname || (existing as any).alias || ''));
    const updatedBarber: Barber = {
      ...existing,
      ...safeProfileData,
      id: profileData.id || targetId || 'b-barber',
      userId: profileData.userId || targetId,
      email: targetEmail || existing.email,
      name: profileData.name ?? existing.name ?? '',
      nickname: resolvedAlias,
      alias: resolvedAlias,
      barbershopName: resolvedShop,
      business_name: resolvedShop,
      shop_name: resolvedShop,
      address: profileData.address !== undefined ? profileData.address : (existing.address || ''),
      avatarUrl: avUrl,
      avatar_url: avUrl,
      avatarColor: profileData.avatarColor || existing.avatarColor || 'from-amber-600 to-amber-800',
      workingDaysText: profileData.workingDaysText || profileData.workingDays || profileData.schedule?.workingDays || existing.workingDaysText || 'Lunes a Sábado',
      is_profile_completed: isCompleted,
      isProfileCompleted: isCompleted,
      schedule: {
        ...((existing as any).schedule || {}),
        ...(profileData.schedule || {}),
        business_name: resolvedShop,
        shop_name: resolvedShop,
        barbershopName: resolvedShop,
        alias: resolvedAlias,
        nickname: resolvedAlias,
        workingDays: profileData.workingDaysText || existing.workingDaysText || 'Lunes a Sábado',
        openTime: (profileData as any).openTime || '9:00 am',
        closeTime: (profileData as any).closeTime || '8:00 pm',
      },
      workingHours: profileData.workingHours || existing.workingHours || {
        start: '09:00',
        end: '20:00',
        slotDurationMinutes: 30,
        lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
        workingDays: [1, 2, 3, 4, 5, 6],
      },
      socialLinks: links,
      social_links: links,
      serviceIds: profileData.serviceIds || existing.serviceIds || [],
      services: profileData.services || existing.services || [],
    };

    try {
      if (targetId) {
        localStorage.setItem(`barbersync_saved_profile_${targetId}`, JSON.stringify(updatedBarber));
      }
    } catch {}

    if (index >= 0) {
      barbers[index] = updatedBarber;
    } else {
      barbers.unshift(updatedBarber);
    }
    this.saveBarbers(barbers);
  },

  /**
   * Obtiene el perfil de barbero en caché local ÚNICAMENTE si pertenece estrictamente al identifier (userId o barberId) indicado.
   * PROHIBIDO retornar el perfil de otro barbero.
   */
  getBarberProfile(identifier: string, email?: string): (Partial<Barber> & Record<string, any>) | null {
    if (!identifier) return null;

    const belongsToIdentifier = (obj: any): boolean => {
      if (!obj) return false;
      const objId = String(obj.id || '').trim();
      const objUserId = String(obj.userId || obj.user_id || '').trim();
      if (objUserId && objUserId === identifier) return true;
      if (objId && objId === identifier) return true;
      return false;
    };

    // 1. Try local storage with identifier (user.id or barber.id)
    const raw = localStorage.getItem(`barbersync_barber_profile_${identifier}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (belongsToIdentifier(parsed) && (parsed.name || parsed.barbershopName || parsed.business_name)) {
          return parsed;
        }
      } catch {}
    }

    // 2. Try local storage with email ONLY if its userId/id matches identifier
    if (email) {
      const cleanEmail = email.toLowerCase().trim();
      const rawEmail = localStorage.getItem(`barbersync_barber_profile_${cleanEmail}`);
      if (rawEmail) {
        try {
          const parsed = JSON.parse(rawEmail);
          if (belongsToIdentifier(parsed) && (parsed.name || parsed.barbershopName || parsed.business_name)) {
            return parsed;
          }
        } catch {}
      }
    }

    // 3. Try to check current authenticated session in localStorage ONLY if sessionUser.id === identifier
    try {
      const sessionUserRaw = localStorage.getItem('barbersync_current_user_v1');
      if (sessionUserRaw) {
        const sessionUser = JSON.parse(sessionUserRaw);
        if (sessionUser?.id === identifier && sessionUser?.barberProfile && belongsToIdentifier(sessionUser.barberProfile)) {
          return sessionUser.barberProfile;
        }
      }
    } catch {}

    // 4. Try from cached barbers list strictly matching id or userId === identifier
    const barbers = this.getBarbers();
    const match = barbers.find(
      (b) => b.id === identifier || b.userId === identifier || (b as any).user_id === identifier
    );
    if (match && (match.name || match.barbershopName || (match as any).business_name)) {
      return match;
    }

    return null;
  },

  /**
   * Sincroniza un perfil de barbero obtenido desde la nube (metadata Auth o DB)
   * hacia localStorage y el estado en memoria de forma inmediata.
   */
  syncCloudBarberProfile(userId: string, cloudProfile: any, email?: string): Barber {
    const cleanEmail = (email || cloudProfile.email || '').toLowerCase().trim();
    const barberId = cloudProfile.id || userId;

    const prevSaved = this.getBarberProfile(userId, cleanEmail);

    const safeCover =
      cloudProfile.cover_url ||
      cloudProfile.coverUrl ||
      cloudProfile.avatar_url ||
      cloudProfile.avatarUrl ||
      prevSaved?.coverUrl ||
      prevSaved?.cover_url ||
      prevSaved?.avatarUrl ||
      prevSaved?.avatar_url ||
      undefined;

    const safeAvatar =
      cloudProfile.avatar_url ||
      cloudProfile.avatarUrl ||
      cloudProfile.avatar ||
      prevSaved?.avatarUrl ||
      prevSaved?.avatar_url ||
      safeCover ||
      undefined;

    const rawShop = String(
      cloudProfile.business_name ||
      cloudProfile.barbershopName ||
      cloudProfile.barbershop_name ||
      cloudProfile.shop_name ||
      ''
    ).trim();

    const rawAlias = String(
      cloudProfile.alias ||
      cloudProfile.nickname ||
      ''
    ).trim();

    const normalizedProfile: Barber = {
      id: barberId,
      userId: userId,
      email: cleanEmail,
      name: cloudProfile.name || '',
      nickname: rawAlias,
      alias: rawAlias,
      barbershopName: rawShop,
      business_name: rawShop,
      businessName: rawShop,
      shop_name: rawShop,
      address: cloudProfile.address || '',
      specialty: cloudProfile.specialty || '',
      bio: cloudProfile.bio || '',
      phone: cloudProfile.phone || '',
      instagram: cloudProfile.instagram || '',
      avatarColor: cloudProfile.avatarColor || cloudProfile.avatar_color || 'from-amber-600 to-amber-800',
      avatarUrl: safeAvatar,
      avatar_url: safeAvatar,
      coverUrl: safeCover,
      cover_url: safeCover,
      rating: Number(cloudProfile.rating || 5.0),
      reviewCount: Number(cloudProfile.reviewCount || cloudProfile.review_count || 0),
      socialLinks: cloudProfile.social_links || cloudProfile.socialLinks || [],
      social_links: cloudProfile.social_links || cloudProfile.socialLinks || [],
      serviceIds: cloudProfile.serviceIds || cloudProfile.service_ids || [],
      services: cloudProfile.services || [],
      workingDaysText: cloudProfile.workingDaysText || cloudProfile.working_days_text || cloudProfile.workingDays || 'Lunes a Sábado',
      workingDays: cloudProfile.workingDays || cloudProfile.working_days_text || 'Lunes a Sábado',
      openTime: cloudProfile.openTime || '9:00 am',
      closeTime: cloudProfile.closeTime || '8:00 pm',
      schedule: cloudProfile.schedule || {
        workingDays: cloudProfile.workingDaysText || 'Lunes a Sábado',
        openTime: cloudProfile.openTime || '9:00 am',
        closeTime: cloudProfile.closeTime || '8:00 pm',
      },
      workingHours: cloudProfile.workingHours || cloudProfile.working_hours || {
        start: '09:00',
        end: '20:00',
        slotDurationMinutes: 30,
        lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
        workingDays: [1, 2, 3, 4, 5, 6],
      },
      is_profile_completed: cloudProfile.is_profile_complete ?? cloudProfile.is_profile_completed ?? cloudProfile.isProfileCompleted ?? Boolean(rawShop),
      isProfileCompleted: cloudProfile.is_profile_complete ?? cloudProfile.is_profile_completed ?? cloudProfile.isProfileCompleted ?? Boolean(rawShop),
    } as any as Barber;

    // Save to local storage under all associated keys
    this.saveBarberProfile(userId, normalizedProfile, cleanEmail);
    if (barberId !== userId) {
      this.saveBarberProfile(barberId, normalizedProfile, cleanEmail);
    }

    return normalizedProfile;
  },

  /**
   * Requisito 2: Guardado del perfil del barbero estrictamente aislado por user_id
   */
  async saveBarberProfileToCloud(
    currentUser: { id: string; email?: string; [k: string]: any },
    profileData: Partial<Barber> & Record<string, any>,
    services?: Service[]
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!currentUser || !currentUser.id) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    const cleanEmail = (currentUser.email || profileData.email || '').toLowerCase().trim();
    const effectiveServices = services || profileData.services || [];
    const effectiveServiceIds = effectiveServices.map((s: any) => s.id);

    const completeProfileData = {
      ...profileData,
      id: currentUser.id, // ID único y persistente asociado al Auth User
      userId: currentUser.id,
      user_id: currentUser.id,
      email: cleanEmail,
      name: (profileData.name || '').trim(),
      nickname: (profileData.nickname || (profileData as any).alias || '').trim(),
      alias: ((profileData as any).alias || profileData.nickname || '').trim(),
      barbershopName: (profileData.barbershopName || (profileData as any).business_name || (profileData as any).shop_name || '').trim(),
      business_name: ((profileData as any).business_name || profileData.barbershopName || (profileData as any).shop_name || '').trim(),
      shop_name: ((profileData as any).shop_name || profileData.barbershopName || (profileData as any).business_name || '').trim(),
      address: (profileData.address || '').trim(),
      specialty: (profileData.specialty || '').trim(),
      bio: (profileData.bio || '').trim(),
      phone: (profileData.phone || '').trim(),
      instagram: (profileData.instagram || '').trim(),
      avatarColor: profileData.avatarColor || 'from-amber-600 to-amber-800',
      avatarUrl: profileData.avatarUrl || undefined,
      socialLinks: profileData.socialLinks || [],
      services: effectiveServices,
      serviceIds: effectiveServiceIds,
      workingDaysText: profileData.workingDaysText || profileData.workingDays || 'Lunes a Sábado',
      workingDays: profileData.workingDays || profileData.workingDaysText || 'Lunes a Sábado',
      openTime: profileData.openTime || profileData.workingHoursStart || '9:00 am',
      closeTime: profileData.closeTime || profileData.workingHoursEnd || '8:00 pm',
      schedule: {
        ...(profileData.schedule || {}),
        business_name: ((profileData as any).business_name || profileData.barbershopName || (profileData as any).shop_name || '').trim(),
        shop_name: ((profileData as any).shop_name || profileData.barbershopName || (profileData as any).business_name || '').trim(),
        barbershopName: (profileData.barbershopName || (profileData as any).business_name || (profileData as any).shop_name || '').trim(),
        alias: ((profileData as any).alias || profileData.nickname || '').trim(),
        nickname: (profileData.nickname || (profileData as any).alias || '').trim(),
        rating: (profileData as any).rating || 5,
        profile_meta: {
          alias: ((profileData as any).alias || profileData.nickname || '').trim(),
          nickname: (profileData.nickname || (profileData as any).alias || '').trim(),
          business_name: ((profileData as any).business_name || profileData.barbershopName || (profileData as any).shop_name || '').trim(),
          shop_name: ((profileData as any).shop_name || profileData.barbershopName || (profileData as any).business_name || '').trim(),
          barbershopName: (profileData.barbershopName || (profileData as any).business_name || (profileData as any).shop_name || '').trim(),
          rating: (profileData as any).rating || 5,
        },
        workingDays: profileData.workingDaysText || profileData.workingDays || 'Lunes a Sábado',
        openTime: profileData.openTime || profileData.workingHoursStart || '9:00 am',
        closeTime: profileData.closeTime || profileData.workingHoursEnd || '8:00 pm',
      },
      workingHours: profileData.workingHours || {
        start: '09:00',
        end: '20:00',
        slotDurationMinutes: 30,
        lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
        workingDays: [1, 2, 3, 4, 5, 6],
      },
      is_profile_complete: profileData.is_profile_completed ?? profileData.isProfileCompleted ?? true,
      is_profile_completed: profileData.is_profile_completed ?? profileData.isProfileCompleted ?? true,
      isProfileCompleted: profileData.is_profile_completed ?? profileData.isProfileCompleted ?? true,
      updatedAt: new Date().toISOString(),
    };

    // 1. Guardar localmente de inmediato para que la UI no sufra latencia
    this.saveBarberProfile(currentUser.id, completeProfileData, cleanEmail);
    if (effectiveServices.length > 0) {
      this.saveServices(effectiveServices);
    }

    let dbErrorMsg: string | undefined;

    // 2. Guardar en public.barbers consultando estrictamente por user_id = currentUser.id
    try {
      const candidateCover =
        (completeProfileData as any).cover_url ||
        (completeProfileData as any).coverUrl ||
        completeProfileData.avatarUrl ||
        (completeProfileData as any).avatar_url ||
        null;

      const safeCover =
        candidateCover &&
        typeof candidateCover === 'string' &&
        !candidateCover.startsWith('blob:')
          ? candidateCover
          : null;

      const targetAlias = (completeProfileData.alias || completeProfileData.nickname || '').trim();
      const targetBusinessName = (completeProfileData.business_name || completeProfileData.barbershopName || (completeProfileData as any).shop_name || '').trim();
      const targetInstagram = (completeProfileData.instagram || (completeProfileData.socialLinks?.find((l: any) => l.platform === 'instagram')?.url || '')).trim();

      let targetRowId = currentUser.id;

      try {
        const { data: existingRow } = await supabase
          .from('barbers')
          .select('*')
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (existingRow && existingRow.id) {
          targetRowId = String(existingRow.id);
          completeProfileData.id = targetRowId;

          const updatePayload: any = {
            user_id: currentUser.id,
            email: cleanEmail,
            name: completeProfileData.name,
            alias: targetAlias,
            business_name: targetBusinessName,
            specialty: completeProfileData.specialty,
            bio: completeProfileData.bio,
            description: completeProfileData.bio,
            address: completeProfileData.address,
            phone: completeProfileData.phone,
            whatsapp: completeProfileData.phone,
            instagram: targetInstagram,
            start_time: completeProfileData.openTime || completeProfileData.workingHours?.start || '09:00',
            end_time: completeProfileData.closeTime || completeProfileData.workingHours?.end || '20:00',
            working_days: completeProfileData.workingDaysText || completeProfileData.workingDays || 'Lunes a Sábado',
            ...(safeCover ? { avatar_url: safeCover, cover_url: safeCover } : {}),
            services: effectiveServices,
            social_links: completeProfileData.socialLinks,
            schedule: completeProfileData.schedule,
            updated_at: new Date().toISOString(),
          };

          const { error: updErr } = await supabase
            .from('barbers')
            .update(updatePayload)
            .eq('user_id', currentUser.id);

          if (updErr) {
            console.warn('public.barbers update notice:', updErr.message);
            dbErrorMsg = updErr.message;
          }
        } else {
          const { error: insErr } = await supabase.from('barbers').insert({
            id: currentUser.id,
            user_id: currentUser.id,
            email: cleanEmail,
            name: completeProfileData.name,
            alias: targetAlias,
            business_name: targetBusinessName,
            specialty: completeProfileData.specialty,
            bio: completeProfileData.bio,
            description: completeProfileData.bio,
            address: completeProfileData.address,
            phone: completeProfileData.phone,
            whatsapp: completeProfileData.phone,
            instagram: targetInstagram,
            start_time: completeProfileData.openTime || completeProfileData.workingHours?.start || '09:00',
            end_time: completeProfileData.closeTime || completeProfileData.workingHours?.end || '20:00',
            working_days: completeProfileData.workingDaysText || completeProfileData.workingDays || 'Lunes a Sábado',
            avatar_url: safeCover,
            cover_url: safeCover,
            services: effectiveServices,
            social_links: completeProfileData.socialLinks,
            schedule: completeProfileData.schedule,
            updated_at: new Date().toISOString(),
          });

          if (insErr) {
            console.warn('public.barbers insert notice:', insErr.message);
            dbErrorMsg = insErr.message;
          }
        }
      } catch (innerErr: any) {
        console.warn('public.barbers check/update exception:', innerErr);
        dbErrorMsg = innerErr?.message;
      }

      // Actualizar caché local con el ID unificado
      this.saveBarberProfile(targetRowId, completeProfileData, cleanEmail);
    } catch (dbException: any) {
      console.warn('public.barbers upsert exception:', dbException);
      dbErrorMsg = dbException?.message;
    }

    return {
      success: true,
      error: dbErrorMsg,
      data: completeProfileData,
    };
  },

  /**
   * Requisito 2: Recuperación del perfil del barbero autenticado estrictamente por user_id:
   * supabase.from("barbers").select("*").eq("user_id", authUser.id).single()
   * Si devuelve null o error, inicializa el estado 100% VACÍO sin caer en mocks ni datos de otros barberos.
   */
  async fetchAndSyncUserProfile(user: { id: string; email?: string; user_metadata?: any }): Promise<{
    profile: Barber | null;
    services: Service[];
  }> {
    if (!user || !user.id) {
      return { profile: null, services: [] };
    }

    // Si el usuario tiene rol de cliente explícito, no asociarle ni crearle perfil de barbero
    const activeRole = typeof localStorage !== 'undefined' ? localStorage.getItem('barbersync_active_role') : null;
    const userMeta = user.user_metadata || {};
    if (activeRole === 'client' || userMeta.role === 'client' || userMeta.barbersync_role === 'client') {
      return { profile: null, services: [] };
    }

    const cleanEmail = (user.email || user.user_metadata?.email || '').toLowerCase().trim();

    try {
      // Requisito 2: Consulta estricta por user_id usando maybeSingle() para evitar error HTTP 406
      const { data, error } = await supabase
        .from('barbers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error || !data) {
        // Requisito 2b: PROHIBIDO hacer fallback a perfiles de prueba, mocks o datos en caché.
        // Inicializar 100% VACÍO
        const emptyProfile = this.createEmptyBarberProfile(user.id, cleanEmail);
        return { profile: emptyProfile, services: [] };
      }

      const resolvedAlias = String(
        data.alias ||
        data.schedule?.profile_meta?.alias ||
        data.nickname ||
        ''
      ).trim();

      const resolvedBusinessName = String(
        data.business_name ||
        data.schedule?.profile_meta?.business_name ||
        data.businessName ||
        data.shop_name ||
        data.barbershop_name ||
        ''
      ).trim();

      const servicesFound: Service[] = Array.isArray(data.services) ? data.services : [];
      const hasConfiguredBusiness = Boolean(
        data.is_profile_completed && (resolvedBusinessName || data.name)
      );

      if (!hasConfiguredBusiness && !resolvedBusinessName && !resolvedAlias && !data.phone && servicesFound.length === 0) {
        const emptyProfile = this.createEmptyBarberProfile(user.id, cleanEmail);
        return { profile: emptyProfile, services: [] };
      }

      const cloudProfile = {
        id: data.id || user.id,
        userId: user.id,
        email: data.email || cleanEmail,
        name: data.name || '',
        alias: resolvedAlias,
        nickname: resolvedAlias,
        business_name: resolvedBusinessName,
        businessName: resolvedBusinessName,
        barbershopName: resolvedBusinessName,
        shop_name: resolvedBusinessName,
        address: data.address || '',
        specialty: data.specialty || '',
        bio: data.bio || data.description || '',
        phone: data.phone || data.whatsapp || '',
        instagram: data.instagram || '',
        avatarColor: data.avatar_color || 'from-amber-600 to-amber-800',
        avatarUrl: data.avatar_url || (data as any).avatar,
        avatar_url: data.avatar_url || (data as any).avatar,
        coverUrl: data.cover_url || data.avatar_url,
        cover_url: data.cover_url || data.avatar_url,
        socialLinks: data.social_links || data.socialLinks || [],
        social_links: data.social_links || data.socialLinks || [],
        workingDaysText: data.working_days || data.working_days_text || 'Lunes a Sábado',
        workingDays: data.working_days || data.working_days_text || 'Lunes a Sábado',
        openTime: data.start_time || data.open_time || '9:00 am',
        closeTime: data.end_time || data.close_time || '8:00 pm',
        schedule: data.schedule || {
          workingDays: data.working_days || 'Lunes a Sábado',
          openTime: data.start_time || '9:00 am',
          closeTime: data.end_time || '8:00 pm',
        },
        workingHours: data.working_hours || data.schedule?.workingHours || {
          start: data.start_time || '09:00',
          end: data.end_time || '20:00',
          slotDurationMinutes: 30,
          lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
          workingDays: [1, 2, 3, 4, 5, 6],
        },
        is_profile_completed: hasConfiguredBusiness,
        isProfileCompleted: hasConfiguredBusiness,
        services: servicesFound,
        serviceIds: servicesFound.map((s: any) => s.id),
      };

      const syncedBarber = this.syncCloudBarberProfile(user.id, cloudProfile, cleanEmail);
      return { profile: syncedBarber, services: servicesFound };
    } catch (err) {
      console.warn('Error querying barbers table for user:', err);
      const emptyProfile = this.createEmptyBarberProfile(user.id, cleanEmail);
      return { profile: emptyProfile, services: [] };
    }
  },

  getServices(): Service[] {
    const data = localStorage.getItem(STORAGE_KEYS.SERVICES);
    if (!data) {
      localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(INITIAL_SERVICES));
      return INITIAL_SERVICES;
    }
    try {
      return JSON.parse(data);
    } catch {
      return INITIAL_SERVICES;
    }
  },

  saveServices(services: Service[]): void {
    localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
  },

  async updateServices(services: Service[]): Promise<Service[]> {
    this.saveServices(services);
    try {
      for (const s of services) {
        await supabase.from('services').upsert({
          id: s.id,
          name: s.name,
          category: s.category,
          duration_minutes: s.durationMinutes,
          price: s.price,
          description: s.description,
          barber_id: s.barberId,
          barbershop_name: s.barbershopName,
        });
      }
    } catch (err) {
      console.warn('Supabase updateServices exception:', err);
    }
    return services;
  },

  /**
   * Obtener servicios específicos y persistidos del barbero estrictamente aislados por barberId / userId
   */
  getServicesForBarber(barberId?: string, userId?: string, email?: string): Service[] {
    if (!barberId && !userId) return [];
    const cleanEmail = (email || '').toLowerCase().trim();
    // 1. Revisar claves dedicadas de servicios por ID de este barbero (sin clave global compartida)
    const keys = [
      userId ? `barbersync_barber_services_${userId}` : null,
      barberId ? `barbersync_barber_services_${barberId}` : null,
    ].filter(Boolean) as string[];

    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }

    // 2. Revisar perfil guardado del barbero (validando pertenencia por userId / barberId)
    const prof = this.getBarberProfile(userId || barberId || '', cleanEmail);
    if (prof && Array.isArray(prof.services) && prof.services.length > 0) {
      return prof.services;
    }

    // 3. Revisar lista de barberos en caché estrictamente por id / userId
    const barbers = this.getBarbers();
    const match = barbers.find(
      (b) =>
        (userId && (b.userId === userId || b.id === userId)) ||
        (barberId && (b.id === barberId || b.userId === barberId))
    );
    if (match && Array.isArray(match.services) && match.services.length > 0) {
      return match.services;
    }

    // 4. Filtrar del catálogo general únicamente por barberId o userId propios
    const allServices = this.getServices();
    const filtered = allServices.filter(
      (s) =>
        (barberId && s.barberId === barberId) ||
        (userId && s.barberId === userId) ||
        (match?.serviceIds && match.serviceIds.includes(s.id)) ||
        (prof?.serviceIds && prof.serviceIds.includes(s.id))
    );
    return filtered;
  },

  /**
   * Obtener configuración de disponibilidad y horarios guardada estrictamente aislada por barberId / userId
   */
  getBarberAvailabilitySettings(barberId?: string, userId?: string, email?: string): any {
    if (!barberId && !userId) return null;
    const cleanEmail = (email || '').toLowerCase().trim();
    const keys = [
      userId ? `barbersync_availability_${userId}` : null,
      barberId ? `barbersync_availability_${barberId}` : null,
    ].filter(Boolean) as string[];

    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.workingHours || parsed.startTime)) {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            if (Array.isArray(parsed.exceptions)) {
              parsed.exceptions = parsed.exceptions.filter((e: any) => !e || !e.date || e.date >= todayStr);
            }
            if (Array.isArray(parsed.special_hours)) {
              parsed.special_hours = parsed.special_hours.filter((e: any) => !e || !e.date || e.date >= todayStr);
            }
            if (parsed.workingHours && Array.isArray(parsed.workingHours.specialDaySchedules)) {
              parsed.workingHours.specialDaySchedules = parsed.workingHours.specialDaySchedules.filter((e: any) => !e || !e.date || e.date >= todayStr);
            }
            return parsed;
          }
        }
      } catch {}
    }

    // Revisar perfil de barbero propio
    const prof = this.getBarberProfile(userId || barberId || '', cleanEmail);
    if (prof && (prof.workingHours || prof.working_hours)) {
      const wh = prof.workingHours || prof.working_hours;
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (Array.isArray(wh.specialDaySchedules)) {
        wh.specialDaySchedules = wh.specialDaySchedules.filter((e: any) => !e || !e.date || e.date >= todayStr);
      }
      return {
        startTime: wh.start,
        endTime: wh.end,
        workingHours: wh,
        restDay: prof.restDay || '0',
        workingDays: wh.workingDays,
      };
    }

    return null;
  },

  /**
   * Persistencia Real e Inmediata al Guardar Nuevos Servicios (aislada por barbero)
   */
  async persistServicesForBarber(
    barberId: string,
    userId: string | undefined,
    updatedServices: Service[],
    email?: string
  ): Promise<void> {
    const cleanEmail = (email || '').toLowerCase().trim();
    const serviceIds = updatedServices.map((s) => s.id);

    // 1. Guardar en clave dedicada de servicios por ID (sin clave global compartida)
    const serviceKeys = [
      barberId ? `barbersync_barber_services_${barberId}` : null,
      userId ? `barbersync_barber_services_${userId}` : null,
    ].filter(Boolean) as string[];

    serviceKeys.forEach((key) => {
      try {
        localStorage.setItem(key, JSON.stringify(updatedServices));
      } catch {}
    });

    // 2. Guardar en perfiles locales de localStorage
    const keys = [
      barberId ? `barbersync_barber_profile_${barberId}` : null,
      userId ? `barbersync_barber_profile_${userId}` : null,
    ].filter(Boolean) as string[];

    keys.forEach((key) => {
      try {
        const raw = localStorage.getItem(key);
        const existing = raw ? JSON.parse(raw) : {};
        existing.services = updatedServices;
        existing.serviceIds = serviceIds;
        localStorage.setItem(key, JSON.stringify(existing));
      } catch {
        // ignore
      }
    });

    // 3. Actualizar sesión actual en localStorage ÚNICAMENTE si corresponde a este barbero
    try {
      const sessionUserRaw = localStorage.getItem('barbersync_current_user_v1');
      if (sessionUserRaw) {
        const sessionUser = JSON.parse(sessionUserRaw);
        if (sessionUser?.id && (sessionUser.id === userId || sessionUser.id === barberId)) {
          if (!sessionUser.user_metadata) sessionUser.user_metadata = {};
          if (!sessionUser.user_metadata.barber_profile) sessionUser.user_metadata.barber_profile = {};
          sessionUser.user_metadata.services = updatedServices;
          sessionUser.user_metadata.barber_profile.services = updatedServices;
          sessionUser.user_metadata.barber_profile.serviceIds = serviceIds;
          sessionUser.services = updatedServices;
          localStorage.setItem('barbersync_current_user_v1', JSON.stringify(sessionUser));
        }
      }
    } catch {}

    // 4. Actualizar lista global de servicios en localStorage
    const allServices = this.getServices();
    const otherServices = allServices.filter(
      (s) => s.barberId !== barberId && (!userId || s.barberId !== userId)
    );
    const nextAllServices = [...otherServices, ...updatedServices];
    this.saveServices(nextAllServices);

    // 5. Actualizar barberos cacheados
    const barbers = this.getBarbers();
    const updatedBarbers = barbers.map((b) => {
      if (
        b.id === barberId ||
        (userId && (b.id === userId || b.userId === userId))
      ) {
        return {
          ...b,
          services: updatedServices,
          serviceIds,
        };
      }
      return b;
    });
    this.saveBarbers(updatedBarbers);

    // 6. Guardar en public.barbers estrictamente filtrando por user_id
    try {
      const targetUserId = userId || barberId;
      if (targetUserId) {
        await supabase
          .from('barbers')
          .update({ services: updatedServices })
          .eq('user_id', targetUserId);
      }
    } catch (err) {
      console.warn('Error al guardar servicios en public.barbers:', err);
    }
  },

  async deleteServiceFromCloud(_serviceId: string): Promise<void> {
    // La eliminación de servicios se persiste directamente vía persistServicesForBarber
  },

  /**
   * Persistencia total de horarios y disponibilidad (aislada estrictamente por barbero)
   */
  async saveBarberAvailabilitySettings(params: {
    barberId: string;
    userId?: string;
    workingHours: Barber['workingHours'];
    restDay: string;
    email?: string;
    persistToCloud?: boolean;
  }): Promise<void> {
    const { barberId, userId, workingHours, restDay, email, persistToCloud = false } = params;
    const cleanEmail = (email || '').toLowerCase().trim();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const exceptionsList = (workingHours.specialDaySchedules || []).filter(
      (e: any) => !e || !e.date || e.date >= todayStr
    );

    const config = {
      startTime: workingHours.start,
      endTime: workingHours.end,
      lunchEnabled: Boolean(workingHours.lunchBreak?.enabled),
      lunchStart: workingHours.lunchBreak?.start || '14:00',
      lunchEnd: workingHours.lunchBreak?.end || '15:00',
      lunch_break: workingHours.lunchBreak,
      restDay,
      rest_day: restDay,
      workingDays: workingHours.workingDays,
      workingHours,
      exceptions: exceptionsList,
      special_hours: exceptionsList,
      updatedAt: new Date().toISOString(),
    };

    // 1. Guardar en claves dedicadas de disponibilidad por ID (sin clave global compartida)
    const availKeys = [
      barberId ? `barbersync_availability_${barberId}` : null,
      userId ? `barbersync_availability_${userId}` : null,
    ].filter(Boolean) as string[];

    availKeys.forEach((key) => {
      try {
        localStorage.setItem(key, JSON.stringify(config));
      } catch {}
    });

    // 2. Guardar en perfiles locales de localStorage por ID
    const keys = [
      barberId ? `barbersync_barber_profile_${barberId}` : null,
      userId ? `barbersync_barber_profile_${userId}` : null,
    ].filter(Boolean) as string[];

    keys.forEach((key) => {
      try {
        const raw = localStorage.getItem(key);
        const existing = raw ? JSON.parse(raw) : {};
        existing.workingHours = workingHours;
        existing.working_hours = workingHours;
        existing.restDay = restDay;
        existing.openTime = workingHours.start;
        existing.closeTime = workingHours.end;
        if (!existing.schedule) existing.schedule = {};
        existing.schedule.openTime = workingHours.start;
        existing.schedule.closeTime = workingHours.end;
        existing.schedule.exceptions = exceptionsList;
        existing.schedule.special_hours = exceptionsList;
        existing.schedule.rest_day = restDay;
        existing.schedule.lunch_break = workingHours.lunchBreak;
        localStorage.setItem(key, JSON.stringify(existing));
      } catch {
        // ignore
      }
    });

    // 3. Actualizar sesión actual en localStorage ÚNICAMENTE si corresponde al barbero autenticado
    try {
      const sessionUserRaw = localStorage.getItem('barbersync_current_user_v1');
      if (sessionUserRaw) {
        const sessionUser = JSON.parse(sessionUserRaw);
        if (sessionUser?.id && (sessionUser.id === userId || sessionUser.id === barberId)) {
          if (!sessionUser.user_metadata) sessionUser.user_metadata = {};
          if (!sessionUser.user_metadata.barber_profile) sessionUser.user_metadata.barber_profile = {};
          sessionUser.user_metadata.working_hours = workingHours;
          sessionUser.user_metadata.availability_config = config;
          sessionUser.user_metadata.barber_profile.workingHours = workingHours;
          sessionUser.user_metadata.barber_profile.working_hours = workingHours;
          sessionUser.user_metadata.barber_profile.restDay = restDay;
          sessionUser.user_metadata.barber_profile.openTime = workingHours.start;
          sessionUser.user_metadata.barber_profile.closeTime = workingHours.end;
          localStorage.setItem('barbersync_current_user_v1', JSON.stringify(sessionUser));
        }
      }
    } catch {}

    // 4. Actualizar lista de barberos en localStorage
    const barbers = this.getBarbers();
    const updatedBarbers = barbers.map((b) => {
      if (
        b.id === barberId ||
        (userId && (b.id === userId || b.userId === userId))
      ) {
        return {
          ...b,
          workingHours,
          openTime: workingHours.start,
          closeTime: workingHours.end,
          schedule: {
            workingDays: b.schedule?.workingDays || b.workingDaysText || 'Lunes a Sábado',
            openTime: workingHours.start,
            closeTime: workingHours.end,
            exceptions: exceptionsList,
            special_hours: exceptionsList,
            rest_day: restDay,
            lunch_break: workingHours.lunchBreak,
          },
        };
      }
      return b;
    });
    this.saveBarbers(updatedBarbers);

    // 5. Persistir en public.barbers ÚNICAMENTE si se solicitó explícitamente (ej. edición intencional en modal)
    // 5. Persistir en public.barbers inmediatamente si persistToCloud es true
    if (persistToCloud) {
      try {
        const updateData: any = {
          start_time: workingHours.start,
          end_time: workingHours.end,
          working_days: config.workingDays || workingHours.workingDays,
          schedule: config,
          working_hours: workingHours,
        };

        const targetIds = [
          barberId,
          barberId ? barberId.replace(/^b-/, '') : null,
          userId,
        ].filter(Boolean) as string[];

        let updated = false;
        for (const tId of targetIds) {
          const { error: err1 } = await supabase.from('barbers').update(updateData).eq('id', tId);
          if (!err1) updated = true;
          const { error: err2 } = await supabase.from('barbers').update(updateData).eq('user_id', tId);
          if (!err2) updated = true;
        }

        if (!updated && cleanEmail) {
          await supabase.from('barbers').update(updateData).eq('email', cleanEmail);
        }
      } catch (err) {
        console.warn('Error al guardar disponibilidad en public.barbers:', err);
      }
    }
  },

  // Helper to map DB row to Appointment
  mapFromDbAppointment(row: any): Appointment {
    return rowToAppointment(row);
  },

  // Synchronous appointments cache (for instant component mount)
  getCachedAppointments(): Appointment[] {
    const data = localStorage.getItem(STORAGE_KEYS.APPOINTMENTS);
    if (!data) {
      const initial = getInitialAppointments();
      localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(initial));
      return initial;
    }
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  saveAppointments(appointments: Appointment[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(appointments));
    } catch (err) {
      console.warn('Error saving appointments to localStorage:', err);
    }
  },

  // Punto 2: Fusión garantizada por ID, Código o por 'appointment_date + appointment_time'
  mergeAppointments(local: Appointment[], remote: Appointment[]): Appointment[] {
    const map = new Map<string, Appointment>();

    // 1. Agregar todos los turnos locales primero (fuente de respaldo garantizada)
    (local || []).forEach((apt) => {
      if (apt && apt.id) {
        const d = (apt.date || (apt as any).appointment_date || '').trim();
        const t = normalizeTime(apt.time || (apt as any).appointment_time || '');
        const unifiedBId = resolveUnifiedBarberId(String(apt.barberId || (apt as any).barber_id || ''));
        map.set(apt.id, {
          ...apt,
          barberId: unifiedBId,
          barber_id: unifiedBId,
          date: d,
          appointment_date: d,
          time: t,
          appointment_time: t,
        });
      }
    });

    // 2. Fusionar turnos remotos de public.appointments
    (remote || []).forEach((remoteApt) => {
      if (!remoteApt || !remoteApt.id) return;
      const normalizedRemoteTime = normalizeTime(remoteApt.time || (remoteApt as any).appointment_time || '');
      const remoteDate = (remoteApt.date || (remoteApt as any).appointment_date || '').trim();
      const unifiedRemoteBarberId = resolveUnifiedBarberId(String(remoteApt.barberId || (remoteApt as any).barber_id || ''));

      // Buscar si ya existe por ID
      if (map.has(remoteApt.id)) {
        const localApt = map.get(remoteApt.id)!;
        const resolvedStatus =
          localApt.status === 'cancelled' || remoteApt.status === 'cancelled'
            ? 'cancelled'
            : remoteApt.status || localApt.status;
        map.set(remoteApt.id, {
          ...localApt,
          ...remoteApt,
          barberId: unifiedRemoteBarberId || localApt.barberId,
          barber_id: unifiedRemoteBarberId || localApt.barberId,
          date: remoteDate || localApt.date,
          appointment_date: remoteDate || localApt.date,
          time: normalizedRemoteTime || localApt.time,
          appointment_time: normalizedRemoteTime || localApt.time,
          status: resolvedStatus,
          rated: Boolean(localApt.rated || remoteApt.rated || (localApt as any).reviewCompleted || (remoteApt as any).reviewCompleted),
          rating: remoteApt.rating ?? localApt.rating,
          review: remoteApt.review ?? localApt.review,
          rating_dismissed: Boolean(localApt.rating_dismissed || remoteApt.rating_dismissed),
        });
      } else {
        // Si el ID es diferente, comprobar únicamente por código idéntico (NO sobrescribir por horario)
        let matchedKey: string | null = null;
        for (const [key, localApt] of map.entries()) {
          const isSameCode = remoteApt.code && localApt.code && localApt.code === remoteApt.code;
          if (isSameCode) {
            matchedKey = key;
            break;
          }
        }

        if (matchedKey) {
          const localApt = map.get(matchedKey)!;
          map.delete(matchedKey);
          const resolvedStatus =
            localApt.status === 'cancelled' || remoteApt.status === 'cancelled'
              ? 'cancelled'
              : remoteApt.status || localApt.status;
          map.set(remoteApt.id, {
            ...localApt,
            ...remoteApt,
            barberId: unifiedRemoteBarberId || localApt.barberId,
            barber_id: unifiedRemoteBarberId || localApt.barberId,
            date: remoteDate || localApt.date,
            appointment_date: remoteDate || localApt.date,
            time: normalizedRemoteTime || localApt.time,
            appointment_time: normalizedRemoteTime || localApt.time,
            status: resolvedStatus,
            rated: Boolean(localApt.rated || remoteApt.rated || (localApt as any).reviewCompleted || (remoteApt as any).reviewCompleted),
            rating: remoteApt.rating ?? localApt.rating,
            review: remoteApt.review ?? localApt.review,
            rating_dismissed: Boolean(localApt.rating_dismissed || remoteApt.rating_dismissed),
          });
        } else {
          // Es un turno remoto nuevo con ID único propio (permite coexistencia de cancelados y completados en la misma hora)
          map.set(remoteApt.id, {
            ...remoteApt,
            barberId: unifiedRemoteBarberId,
            barber_id: unifiedRemoteBarberId,
            date: remoteDate,
            appointment_date: remoteDate,
            time: normalizedRemoteTime,
            appointment_time: normalizedRemoteTime,
          });
        }
      }
    });

    return Array.from(map.values());
  },

  // Punto 3: Emisión de eventos en tiempo real sin parpadeos vía BroadcastChannel y Evento Storage
  broadcastAppointmentEvent(eventType: string, appointment?: Appointment): void {
    if (typeof window !== 'undefined') {
      try {
        const channel = new BroadcastChannel('barbersync_channel');
        channel.postMessage({ type: eventType, appointment, timestamp: Date.now() });
        channel.close();
      } catch (err) {
        // BroadcastChannel fallback
      }

      try {
        window.dispatchEvent(
          new CustomEvent('barbersync_appointment_sync', {
            detail: { type: eventType, appointment },
          })
        );
        window.dispatchEvent(new Event('storage'));
      } catch (err) {
        // Storage event fallback
      }
    }
  },

  // ASYNC: Fetch appointments from Supabase (ordenados por fecha, appointment_time y created_at)
  async getAppointments(): Promise<Appointment[]> {
    const cached = this.getCachedAppointments();
    if (this.getIsMutating()) {
      return cached;
    }

    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_time', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('Supabase: appointments fetch error (using cache):', error.message);
        return cached;
      }

      if (!data || data.length === 0) {
        return cached;
      }

      if (this.getIsMutating()) {
        return cached;
      }

      const remoteMapped = data.map(rowToAppointment);
      const latestCached = this.getCachedAppointments();
      const merged = this.mergeAppointments(latestCached, remoteMapped);
      this.saveAppointments(merged);

      return merged;
    } catch (err) {
      console.warn('Supabase fetch exception:', err);
      return cached;
    }
  },

  async seedInitialAppointmentsToSupabase(appointments: Appointment[]): Promise<void> {
    try {
      const rows = appointments.map(appointmentToRow);
      await supabase.from('appointments').upsert(rows);
    } catch (err) {
      console.warn('Supabase initial seed error:', err);
    }
  },

  /**
   * Requisito 4: Validación asíncrona estricta de disponibilidad previa a la inserción.
   * Consulta a las tablas public.appointments y public.blocked_slots si ya existe un registro
   * para ese barber_id, appointment_date y appointment_time cuyo estado no sea "cancelled".
   */
  async checkSlotAvailability(barberId: string, date: string, time: string): Promise<{ isAvailable: boolean; message?: string }> {
    const normalized = normalizeTime(time);
    const time24 = normalizeTimeTo24h(time);
    const unifiedBarberId = resolveUnifiedBarberId(barberId);

    // 1. Consulta en la tabla pública 'appointments'
    try {
      const { data: dbApts, error: aptErr } = await supabase
        .from('appointments')
        .select('id, code, type, status, appointment_date, date, appointment_time, time, barber_id')
        .neq('status', 'cancelled');

      if (!aptErr && Array.isArray(dbApts)) {
        const conflict = dbApts.find((a) => {
          const aBarberId = String(a.barber_id || '');
          const matchBarber =
            !barberId ||
            !aBarberId ||
            aBarberId === barberId ||
            aBarberId === unifiedBarberId ||
            aBarberId.replace(/^b-/, '').toLowerCase() === String(barberId).replace(/^b-/, '').toLowerCase();
          if (!matchBarber) return false;

          const aDate = a.appointment_date || a.date;
          if (aDate !== date) return false;
          const aTime = a.appointment_time || a.time;
          return normalizeTime(aTime) === normalized || normalizeTimeTo24h(aTime) === time24;
        });
        if (conflict) {
          return {
            isAvailable: false,
            message: 'Este turno acaba de ser tomado por otra persona. Por favor, recarga o elige otro.',
          };
        }
      }
    } catch (err) {
      console.warn('Verificación Supabase appointments error:', err);
    }

    // 2. Consulta en la tabla pública 'blocked_slots'
    try {
      const { data: dbBlocked, error: blockErr } = await supabase
        .from('blocked_slots')
        .select('id, date, time, barber_id');

      if (!blockErr && Array.isArray(dbBlocked)) {
        const conflictBlock = dbBlocked.find((b) => {
          const bBarberId = String(b.barber_id || '');
          const matchBarber =
            !barberId ||
            !bBarberId ||
            bBarberId === barberId ||
            bBarberId === unifiedBarberId ||
            bBarberId.replace(/^b-/, '').toLowerCase() === String(barberId).replace(/^b-/, '').toLowerCase();
          if (!matchBarber) return false;

          if (b.date !== date) return false;
          return normalizeTime(b.time) === normalized || normalizeTimeTo24h(b.time) === time24;
        });
        if (conflictBlock) {
          return {
            isAvailable: false,
            message: 'Este turno acaba de ser tomado por otra persona. Por favor, recarga o elige otro.',
          };
        }
      }
    } catch (err) {
      console.warn('Verificación Supabase blocked_slots error:', err);
    }

    // 3. Consulta de respaldo en almacenamiento local y caché
    const localApts = this.getCachedAppointments();
    const localConflict = localApts.find((a) => {
      const bId = a.barberId || (a as any).barber_id;
      const matchBarber =
        !barberId ||
        !bId ||
        bId === barberId ||
        bId === unifiedBarberId ||
        String(bId).replace(/^b-/, '').toLowerCase() === String(barberId).replace(/^b-/, '').toLowerCase();
      if (!matchBarber) return false;
      if (a.status === 'cancelled') return false;
      const aDate = a.date || (a as any).appointment_date;
      if (aDate !== date) return false;
      const aTime = a.time || (a as any).appointment_time;
      return normalizeTime(aTime) === normalized || normalizeTimeTo24h(aTime) === time24;
    });

    if (localConflict) {
      return {
        isAvailable: false,
        message: 'Este turno acaba de ser tomado por otra persona. Por favor, recarga o elige otro.',
      };
    }

    const localBlocked = this.getCachedBlockedSlots();
    const localBlockedConflict = localBlocked.find((b: BlockedSlot) => {
      const bId = b.barberId;
      const matchBarber =
        !barberId ||
        !bId ||
        bId === barberId ||
        bId === unifiedBarberId ||
        String(bId).replace(/^b-/, '').toLowerCase() === String(barberId).replace(/^b-/, '').toLowerCase();
      if (!matchBarber) return false;
      if (b.date !== date) return false;
      return normalizeTime(b.time) === normalized || normalizeTimeTo24h(b.time) === time24;
    });

    if (localBlockedConflict) {
      return {
        isAvailable: false,
        message: 'Este turno acaba de ser tomado por otra persona. Por favor, recarga o elige otro.',
      };
    }

    return { isAvailable: true };
  },

  // ASYNC: Add appointment to Supabase + local cache
  async addAppointment(appointment: Appointment, currentUser?: import('../types').User | null): Promise<Appointment> {
    const activeUser =
      currentUser ||
      (() => {
        try {
          const raw = localStorage.getItem('barbersync_current_user_v1');
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })();

    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(appointment.id || '');
    const aptId = isValidUuid
      ? appointment.id
      : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'c34ff7ab-e35d-4961-8ba8-ef523a63fbe7');

    const normalizedTime = normalizeTime(
      appointment.appointment_time || (appointment as any).time || appointment.time || ''
    );
    const appointmentDate = (
      appointment.appointment_date || (appointment as any).date || appointment.date || ''
    ).trim();

    const rawBarberId = String((appointment as any).barber_id || appointment.barberId || activeUser?.id || '');
    const candidateBarberId = (rawBarberId && rawBarberId !== 'b-marcos' && rawBarberId !== 'barbero' && rawBarberId !== 'default')
      ? rawBarberId
      : (activeUser?.id || rawBarberId);
    const effectiveBarberId = resolveUnifiedBarberId(candidateBarberId);

    const clientName = (
      (appointment as any).client_name ||
      appointment.clientName ||
      'Cliente'
    ).trim();
    const clientPhone = (
      (appointment as any).client_phone ||
      appointment.clientPhone ||
      'Presencial'
    ).trim();
    const cleanClientEmail = String(
      appointment.clientEmail || (appointment as any).client_email || ''
    ).trim().toLowerCase() || undefined;
    const serviceName =
      (appointment as any).service_name || appointment.serviceName || 'Corte Clásico';
    const price = Number((appointment as any).price ?? (appointment as any).service_price ?? appointment.servicePrice ?? 0);
    const appointmentCode =
      appointment.code || '#CO-' + Math.floor(100000 + Math.random() * 900000);
    let appointmentType = (appointment as any).type;
    if (!appointmentType) {
      appointmentType = appointment.source === 'walk_in' ? 'presencial' : 'virtual';
    } else if (appointmentType === 'web' || appointmentType === 'online') {
      appointmentType = 'virtual';
    }
    const appointmentStatus = appointment.status || 'confirmed';

    // Activar bandera isMutating para pausar consultas periódicas y evitar race conditions
    this.setMutating(true);

    // 1. Inserción directa en la tabla 'appointments' de Supabase con validación de colisiones
    try {
      // Doble comprobación previa de disponibilidad
      const availCheck = await this.checkSlotAvailability(effectiveBarberId, appointmentDate, normalizedTime);
      if (!availCheck.isAvailable) {
        const conflictErr = new Error(availCheck.message || 'Este turno acaba de ser tomado por otra persona. Por favor, recarga o elige otro.');
        (conflictErr as any).code = 'SLOT_CONFLICT';
        throw conflictErr;
      }

      const recordToInsert = {
        id: aptId,
        barber_id: effectiveBarberId,
        client_name: clientName,
        client_phone: clientPhone,
        service_name: serviceName,
        service_price: price,
        price: price,
        appointment_date: appointmentDate,
        date: appointmentDate,
        appointment_time: normalizedTime,
        time: normalizedTime,
        status: appointmentStatus,
        code: appointmentCode,
        type: appointmentType,
        client_id: appointment.clientId || (appointment as any).client_id || 'usr-guest',
        client_email: cleanClientEmail || null,
        notes: appointment.clientNotes || (appointment as any).client_notes || (appointment as any).notes || null,
        duration: Number(appointment.serviceDuration ?? 30),
        created_at: appointment.createdAt || (appointment as any).created_at || new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('appointments')
        .insert([recordToInsert])
        .select();

      if (error) {
        console.error('[BarberAdes Appointments] Error al insertar cita en Supabase:', error.message, error);
        const conflictErr = new Error('Este turno acaba de ser tomado por otra persona. Por favor, recarga o elige otro.');
        (conflictErr as any).code = 'SLOT_CONFLICT';
        throw conflictErr;
      } else {
        console.log('[BarberAdes Appointments] Cita registrada exitosamente en Supabase:', data);
      }
    } catch (err) {
      console.error('[BarberAdes Appointments] Excepción al registrar cita en Supabase:', err);
      throw err;
    } finally {
      setTimeout(() => {
        this.setMutating(false);
      }, 500);
    }

    const guaranteedAppointment: Appointment = {
      ...appointment,
      id: aptId,
      code: appointmentCode,
      clientId: appointment.clientId || (appointment as any).client_id || 'usr-guest',
      client_id: appointment.clientId || (appointment as any).client_id || 'usr-guest',
      barberId: effectiveBarberId,
      barber_id: effectiveBarberId,
      barberEmail: appointment.barberEmail || (appointment as any).barber_email || 'juanja1013@gmail.com',
      barber_email: appointment.barberEmail || (appointment as any).barber_email || 'juanja1013@gmail.com',
      barberName: appointment.barberName || (appointment as any).barber_name || 'Juan Jaramillo',
      barber_name: appointment.barberName || (appointment as any).barber_name || 'Juan Jaramillo',
      serviceId: appointment.serviceId || (appointment as any).service_id || 'srv-custom',
      service_id: appointment.serviceId || (appointment as any).service_id || 'srv-custom',
      serviceName: serviceName,
      service_name: serviceName,
      servicePrice: price,
      service_price: price,
      price: price,
      serviceDuration: Number(appointment.serviceDuration ?? 30),
      time: normalizedTime,
      appointment_time: normalizedTime,
      date: appointmentDate,
      appointment_date: appointmentDate,
      clientName: clientName,
      client_name: clientName,
      clientPhone: clientPhone,
      client_phone: clientPhone,
      clientEmail: cleanClientEmail,
      client_email: cleanClientEmail,
      clientNotes: appointment.clientNotes || (appointment as any).client_notes,
      client_notes: appointment.clientNotes || (appointment as any).client_notes,
      status: appointmentStatus as any,
      source: appointmentType === 'presencial' ? 'walk_in' : 'online',
      type: appointmentType,
      createdAt: appointment.createdAt || new Date().toISOString(),
    };

    // 2. Guardar SIEMPRE en estado React y en localStorage como respaldo garantizado
    const cached = this.getCachedAppointments();
    const updated = [
      guaranteedAppointment,
      ...cached.filter(
        (a) =>
          a.id !== guaranteedAppointment.id &&
          (!a.code || a.code !== guaranteedAppointment.code)
      ),
    ];
    this.saveAppointments(updated);

    // 3. Emisión instantánea en tiempo real sin parpadeos vía BroadcastChannel y Evento Storage
    this.broadcastAppointmentEvent('NEW_BOOKING', guaranteedAppointment);

    return guaranteedAppointment;
  },

  // ASYNC: Update appointment status in Supabase + local cache
  async updateAppointmentStatus(
    id: string,
    status: Appointment['status'],
    metadata?: { cancelledBy?: 'client' | 'barber' }
  ): Promise<Appointment[]> {
    this.setMutating(true);
    // 1. Optimistic local update
    const cached = this.getCachedAppointments();
    let updatedApt: Appointment | undefined;
    const updated = cached.map((apt) => {
      if (apt.id === id) {
        updatedApt = {
          ...apt,
          status,
          cancelledBy:
            metadata?.cancelledBy !== undefined
              ? metadata.cancelledBy
              : status === 'confirmed'
              ? undefined
              : apt.cancelledBy,
        };
        return updatedApt;
      }
      return apt;
    });
    this.saveAppointments(updated);

    // Emisión en tiempo real
    if (updatedApt) {
      this.broadcastAppointmentEvent('STATUS_CHANGE', updatedApt);
    }

    // 2. Persist to Supabase
    try {
      const payload: any = { status };

      const { error } = await supabase
        .from('appointments')
        .update(payload)
        .eq('id', id);

      if (error) {
        console.warn('Supabase update status error:', error.message);
      }
    } catch (err) {
      console.warn('Supabase updateAppointmentStatus exception:', err);
    } finally {
      setTimeout(() => {
        this.setMutating(false);
      }, 2500);
    }

    return updated;
  },

  async cancelAppointment(id: string, cancelledBy: 'client' | 'barber' = 'client'): Promise<Appointment[]> {
    return this.updateAppointmentStatus(id, 'cancelled', { cancelledBy });
  },

  // Consulta estricta del historial de citas de un usuario en public.appointments
  async getUserAppointmentHistory(userId: string): Promise<any[]> {
    if (!userId || userId === 'usr-guest' || userId.startsWith('usr-walkin-')) {
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, code, type, barber_id, client_id, date, appointment_date, time, appointment_time, created_at, status, price, service_price')
        .eq('client_id', userId)
        .order('date', { ascending: false })
        .limit(10);

      if (error || !Array.isArray(data) || data.length === 0) {
        return [];
      }

      const mockIds = new Set(['apt-001', 'apt-002', 'apt-003', 'apt-004', 'apt-005', 'apt-006']);
      return data.filter((row: any) => row && row.id && !mockIds.has(String(row.id)) && row.barber_id);
    } catch (err) {
      console.warn('Error querying getUserAppointmentHistory in Supabase:', err);
      return [];
    }
  },

  async cancelAllAppointmentsForDate(
    barberId: string,
    date: string,
    cancelledBy: 'barber' | 'client' = 'barber'
  ): Promise<Appointment[]> {
    this.setMutating(true);
    const cached = this.getCachedAppointments();
    const targetBarberId = String(barberId || '');
    const updated = cached.map((apt) => {
      const matchBarber = !targetBarberId || String(apt.barberId) === targetBarberId || apt.barberId === targetBarberId;
      if (matchBarber && apt.date === date && apt.status !== 'cancelled') {
        const updatedApt: Appointment = {
          ...apt,
          status: 'cancelled',
          cancelledBy,
        };
        this.broadcastAppointmentEvent('STATUS_CHANGE', updatedApt);
        return updatedApt;
      }
      return apt;
    });
    this.saveAppointments(updated);

    // Persist to Supabase
    try {
      let query = supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          cancelled_by: cancelledBy,
          updated_at: new Date().toISOString(),
        })
        .eq('date', date)
        .neq('status', 'cancelled');

      if (targetBarberId) {
        query = query.eq('barber_id', targetBarberId);
      }
      const { error } = await query;
      if (error) {
        console.warn('Supabase cancelAllAppointmentsForDate notice:', error.message);
      }
    } catch (err) {
      console.warn('Supabase cancelAllAppointmentsForDate exception:', err);
    } finally {
      setTimeout(() => {
        this.setMutating(false);
      }, 2500);
    }

    return updated;
  },

  // ASYNC: Delete appointment from Supabase + local cache
  async deleteAppointment(id: string): Promise<Appointment[]> {
    this.setMutating(true);
    const cached = this.getCachedAppointments();
    const updated = cached.filter((apt) => apt.id !== id);
    this.saveAppointments(updated);
    this.broadcastAppointmentEvent('DELETE_APPOINTMENT', { id } as any);

    try {
      const { error } = await supabase.from('appointments').delete().eq('id', id);
      if (error) {
        console.warn('Supabase delete appointment error:', error.message);
      }
    } catch (err) {
      console.warn('Supabase deleteAppointment exception:', err);
    } finally {
      setTimeout(() => {
        this.setMutating(false);
      }, 2500);
    }

    return updated;
  },

  // Blocked slots cache
  getCachedBlockedSlots(): BlockedSlot[] {
    const data = localStorage.getItem(STORAGE_KEYS.BLOCKED_SLOTS);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  saveBlockedSlots(slots: BlockedSlot[]): void {
    localStorage.setItem(STORAGE_KEYS.BLOCKED_SLOTS, JSON.stringify(slots));
  },

  // ASYNC: Fetch blocked slots from Supabase
  async getBlockedSlots(): Promise<BlockedSlot[]> {
    try {
      const { data, error } = await supabase
        .from('blocked_slots')
        .select('*');

      if (error) {
        console.warn('Supabase: blocked_slots fetch error:', error.message);
        return this.getCachedBlockedSlots();
      }

      if (data) {
        // Consultar schedule.blocked_reasons de los barberos para recuperar el motivo exacto entre PC y celular
        const barberReasonsMap: Record<string, Record<string, string>> = {};
        try {
          const { data: barbersData } = await supabase.from('barbers').select('id, user_id, schedule');
          if (barbersData) {
            barbersData.forEach((b: any) => {
              const reasons = b.schedule?.blocked_reasons || {};
              if (b.id) barberReasonsMap[b.id] = reasons;
              if (b.user_id) barberReasonsMap[b.user_id] = reasons;
            });
          }
        } catch {}

        const cached = this.getCachedBlockedSlots();
        const mapped = data.map(rowToBlockedSlot).map((s) => {
          const found = cached.find(
            (c) => c.id === s.id || (c.barberId === s.barberId && c.date === s.date && c.time === s.time)
          );
          const scheduleReason =
            barberReasonsMap[s.barberId]?.[`${s.date}_${s.time}`] ||
            barberReasonsMap[s.barberId]?.[`${s.date}_${s.time.toLowerCase()}`];

          const resolvedReason =
            (s.reason && s.reason !== 'Bloqueado' && s.reason !== 'Horario Bloqueado')
              ? s.reason
              : (scheduleReason || (found && found.reason && found.reason !== 'Bloqueado' ? found.reason : null) || s.reason || 'Horario Bloqueado');

          return {
            ...s,
            reason: resolvedReason,
          };
        });
        this.saveBlockedSlots(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('Supabase getBlockedSlots exception:', err);
    }
    return this.getCachedBlockedSlots();
  },

  // ASYNC: Add single blocked slot to Supabase
  async addBlockedSlot(slot: BlockedSlot): Promise<BlockedSlot> {
    const results = await this.addBlockedSlots([slot]);
    return results[0] || slot;
  },

  // ASYNC: Add multiple blocked slots in batch to Supabase
  async addBlockedSlots(slots: BlockedSlot[]): Promise<BlockedSlot[]> {
    if (!slots || slots.length === 0) return [];

    const processedSlots = slots.map((s) => {
      const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.id || '');
      const validId = isValidUuid
        ? s.id
        : (typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, '0')}`);
      return {
        ...s,
        id: validId,
      };
    });

    // 1. Guardar de forma inmediata en la caché local
    const cached = this.getCachedBlockedSlots();
    const newSlotIds = new Set(processedSlots.map((s) => s.id));
    const merged = [...cached.filter((s) => !newSlotIds.has(s.id)), ...processedSlots];
    this.saveBlockedSlots(merged);

    // 2. Persistir en Supabase (public.blocked_slots) y respaldar en public.barbers (schedule.blocked_reasons)
    try {
      const rowsWithReason = processedSlots.map(blockedSlotToRow);
      const { error: insertError } = await supabase.from('blocked_slots').insert(rowsWithReason);
      if (insertError) {
        if (insertError.message && (insertError.message.includes('column') || insertError.message.includes('reason'))) {
          // Reintentar sin la columna reason si la tabla remota no la tiene aún
          const rowsBasic = processedSlots.map((s) => {
            const row = blockedSlotToRow(s) as any;
            delete row.reason;
            return row;
          });
          await supabase.from('blocked_slots').insert(rowsBasic);
        } else {
          console.warn('Supabase addBlockedSlots batch insert warning:', insertError.message);
        }
      }

      // 2b. Respaldar mapa en schedule.blocked_reasons dentro de public.barbers para garantizar persistencia multi-dispositivo
      const barberIds = Array.from(new Set(processedSlots.map((s) => s.barberId).filter(Boolean)));
      for (const bId of barberIds) {
        const slotsForB = processedSlots.filter((s) => s.barberId === bId);
        const reasonsMap: Record<string, string> = {};
        slotsForB.forEach((s) => {
          reasonsMap[`${s.date}_${s.time}`] = s.reason || 'Horario Bloqueado';
        });

        const { data: bData } = await supabase.from('barbers').select('schedule').eq('id', bId).maybeSingle();
        const currentSchedule = bData?.schedule || {};
        const updatedSchedule = {
          ...currentSchedule,
          blocked_reasons: {
            ...(currentSchedule.blocked_reasons || {}),
            ...reasonsMap,
          },
        };

        await supabase.from('barbers').update({ schedule: updatedSchedule }).eq('id', bId);

        // Actualizar también en caché local de barbers
        const cachedBarbers = this.getCachedBarbers();
        const bIdx = cachedBarbers.findIndex((b) => b.id === bId || b.userId === bId);
        if (bIdx >= 0) {
          cachedBarbers[bIdx].schedule = updatedSchedule;
          this.saveBarbers(cachedBarbers);
        }
      }
    } catch (err) {
      console.warn('Supabase addBlockedSlots exception:', err);
    }

    // 3. Emitir evento de sincronización en tiempo real
    this.broadcastAppointmentEvent('slot_blocked');

    return processedSlots;
  },

  // ASYNC: Remove blocked slot from Supabase
  async removeBlockedSlot(id: string): Promise<BlockedSlot[]> {
    const cached = this.getCachedBlockedSlots();
    const removedSlot = cached.find((s) => s.id === id);
    const updated = cached.filter((s) => s.id !== id);
    this.saveBlockedSlots(updated);

    try {
      const { error } = await supabase
        .from('blocked_slots')
        .delete()
        .eq('id', id);

      if (error) {
        console.warn('Supabase removeBlockedSlot error:', error.message);
      }

      // Eliminar el motivo de schedule.blocked_reasons en public.barbers
      if (removedSlot && removedSlot.barberId) {
        const key = `${removedSlot.date}_${removedSlot.time}`;
        const { data: bData } = await supabase.from('barbers').select('schedule').eq('id', removedSlot.barberId).maybeSingle();
        if (bData?.schedule?.blocked_reasons) {
          const newReasons = { ...bData.schedule.blocked_reasons };
          delete newReasons[key];
          const updatedSchedule = { ...bData.schedule, blocked_reasons: newReasons };
          await supabase.from('barbers').update({ schedule: updatedSchedule }).eq('id', removedSlot.barberId);

          const cachedBarbers = this.getCachedBarbers();
          const bIdx = cachedBarbers.findIndex((b) => b.id === removedSlot.barberId || b.userId === removedSlot.barberId);
          if (bIdx >= 0) {
            cachedBarbers[bIdx].schedule = updatedSchedule;
            this.saveBarbers(cachedBarbers);
          }
        }
      }
    } catch (err) {
      console.warn('Supabase removeBlockedSlot exception:', err);
    }

    return updated;
  },

  // Unblocked slot exceptions (e.g. for lunch breaks or general working hour rules)
  getUnblockedExceptions(): { barberId: string; date: string; time: string }[] {
    const data = localStorage.getItem(STORAGE_KEYS.UNBLOCKED_EXCEPTIONS);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  saveUnblockedExceptions(exceptions: { barberId: string; date: string; time: string }[]): void {
    localStorage.setItem(STORAGE_KEYS.UNBLOCKED_EXCEPTIONS, JSON.stringify(exceptions));
  },

  addUnblockedException(barberId: string, date: string, time: string): void {
    const current = this.getUnblockedExceptions();
    const exists = current.some((e) => e.barberId === barberId && e.date === date && e.time === time);
    if (!exists) {
      const updated = [...current, { barberId, date, time }];
      this.saveUnblockedExceptions(updated);
    }
  },

  removeUnblockedException(barberId: string, date: string, time: string): void {
    const current = this.getUnblockedExceptions();
    const updated = current.filter((e) => !(e.barberId === barberId && e.date === date && e.time === time));
    this.saveUnblockedExceptions(updated);
  },

  isSlotUnblocked(barberId: string, date: string, time: string): boolean {
    const current = this.getUnblockedExceptions();
    return current.some((e) => e.barberId === barberId && e.date === date && e.time === time);
  },

  getLastClient(): { name: string; phone: string; email?: string } | null {
    const data = localStorage.getItem(STORAGE_KEYS.LAST_CLIENT);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  saveLastClient(client: { name: string; phone: string; email?: string }): void {
    localStorage.setItem(STORAGE_KEYS.LAST_CLIENT, JSON.stringify(client));
  },

  /**
  /**
   * Subida robusta tolerante a fallos (Resilient Hybrid Upload).
   * Intenta subir prioritariamente mediante ArrayBuffer al bucket 'barber-media' de Supabase Storage.
   * Si Storage devuelve 502 Bad Gateway o CORS, activa automáticamente la contingencia WebP directa
   * para no bloquear al usuario con carteles de error.
   */
  async uploadBarberMedia(
    fileBlob: Blob,
    userId: string,
    folder: 'covers' | 'general' = 'covers'
  ): Promise<string> {
    try {
      const arrayBuffer = await fileBlob.arrayBuffer();
      const filePath = `${userId}/${folder}_${Date.now()}.webp`;

      const { error: uploadError } = await supabase.storage
        .from('barber-media')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/webp',
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('barber-media')
        .getPublicUrl(filePath);

      if (typeof localStorage !== 'undefined' && data?.publicUrl) {
        localStorage.setItem('barbersync_temp_cover', data.publicUrl);
      }

      return data.publicUrl;
    } catch (err) {
      console.warn('Supabase Storage 502/CORS detectado. Activando contingencia directa WebP para no bloquear al usuario:', err);

      // Contingencia automática: Convertir a Data URL WebP ultraligero (< 25 KB)
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const resultStr = (reader.result as string) || '';
          if (typeof localStorage !== 'undefined' && resultStr) {
            localStorage.setItem('barbersync_temp_cover', resultStr);
          }
          resolve(resultStr);
        };
        reader.onerror = () => {
          const fallback = (typeof localStorage !== 'undefined' ? localStorage.getItem('barbersync_temp_cover') : '') || '';
          resolve(fallback);
        };
        reader.readAsDataURL(fileBlob);
      });
    }
  },

  // ==========================================
  // SISTEMA DE CALIFICACIÓN DE BARBEROS
  // ==========================================
  async submitBarberRating(
    barberId: string,
    rating: number,
    appointmentId: string,
    comment?: string
  ): Promise<{ newRating: number; newCount: number }> {
    const cleanBarberId = (barberId || '').trim();
    const barbers = this.getCachedBarbers();
    const barber = barbers.find((b) => b.id === cleanBarberId || b.id === cleanBarberId.replace(/^b-/, '') || `b-${b.id}` === cleanBarberId);

    const currentRating = Number(barber?.rating || 5.0);
    const currentCount = Number(barber?.reviewCount || (barber as any)?.reviews_count || 100);
    const newCount = currentCount + 1;
    const newRating = Number(((currentRating * currentCount + rating) / newCount).toFixed(1));

    // 1. Actualizar barberos locales
    const updatedBarbers = barbers.map((b) => {
      if (b.id === cleanBarberId || b.id === cleanBarberId.replace(/^b-/, '') || `b-${b.id}` === cleanBarberId) {
        return {
          ...b,
          rating: newRating,
          reviewCount: newCount,
          reviews_count: newCount,
        };
      }
      return b;
    });
    this.saveBarbers(updatedBarbers);

    // 2. Marcar la cita como calificada localmente
    const localApts = this.getCachedAppointments();
    const updatedApts = localApts.map((a) => {
      if (a.id === appointmentId) {
        return {
          ...a,
          rated: true,
          rating,
          review: comment ?? '',
          reviewComment: comment,
          reviewCompleted: true,
        };
      }
      return a;
    });
    this.saveAppointments(updatedApts);

    // Guardar en reviewed apts para persistencia inmediata
    try {
      const reviewed = this.getReviewedAppointmentIds();
      reviewed.add(appointmentId);
      localStorage.setItem('barbersync_reviewed_apts', JSON.stringify(Array.from(reviewed)));
    } catch {}

    // 3. Persistir inmediatamente en Supabase (public.appointments y public.barbers)
    try {
      const { error: aptUpdateError } = await supabase
        .from('appointments')
        .update({
          rated: true,
          rating: rating,
          review: comment ?? null,
        })
        .eq('id', appointmentId);

      if (aptUpdateError) {
        await supabase
          .from('appointments')
          .update({
            rated: true,
            rating: rating,
          })
          .eq('id', appointmentId);
      }
    } catch (err) {
      console.warn('Error al guardar calificación de cita en Supabase:', err);
    }

    try {
      const targetIds = [cleanBarberId, cleanBarberId.replace(/^b-/, '')].filter(Boolean);
      for (const tId of targetIds) {
        await supabase
          .from('barbers')
          .update({
            rating: newRating,
            reviews_count: newCount,
          })
          .eq('id', tId);
      }
    } catch (err) {
      console.warn('Error al actualizar rating en Supabase public.barbers:', err);
    }

    // 4. Emitir eventos en tiempo real
    this.broadcastAppointmentEvent('BARBER_RATED', {
      barberId: cleanBarberId,
      newRating,
      newCount,
      appointmentId,
    } as any);

    return { newRating, newCount };
  },

  getReviewedAppointmentIds(): Set<string> {
    if (typeof localStorage === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem('barbersync_reviewed_apts');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  },

  async dismissAppointmentReview(appointmentId: string): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('barbersync_dismissed_reviews');
        const set = raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
        set.add(appointmentId);
        localStorage.setItem('barbersync_dismissed_reviews', JSON.stringify(Array.from(set)));
      } catch {}
    }

    // Actualizar en caché local de citas
    try {
      const localApts = this.getCachedAppointments();
      const updatedApts = localApts.map((a) =>
        a.id === appointmentId ? { ...a, rating_dismissed: true } : a
      );
      this.saveAppointments(updatedApts);
    } catch {}

    // Persistir descarte permanente en Supabase (public.appointments)
    try {
      await supabase
        .from('appointments')
        .update({ rating_dismissed: true })
        .eq('id', appointmentId);
    } catch (err) {
      console.warn('Error al marcar rating_dismissed en Supabase:', err);
    }
  },

  getDismissedReviewIds(): Set<string> {
    if (typeof localStorage === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem('barbersync_dismissed_reviews');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  },

  // ==========================================
  // BLOQUEO SILENCIOSO DE CLIENTES & REGLA 3 BLOQUEOS
  // ==========================================
  getClientBlocks(): Array<{ clientEmail: string; barberId: string; blockedAt: string }> {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem('barbersync_client_blocks_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveClientBlocks(blocks: Array<{ clientEmail: string; barberId: string; blockedAt: string }>): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('barbersync_client_blocks_v1', JSON.stringify(blocks));
      window.dispatchEvent(new Event('barbersync_blocks_sync'));
      try {
        const ch = new BroadcastChannel('barbersync_channel');
        ch.postMessage({ type: 'CLIENT_BLOCKS_UPDATED' });
        ch.close();
      } catch {}
    } catch {}
  },

  async blockClient(
    barberId: string,
    clientEmail: string
  ): Promise<{ totalDistinctBarbers: number; isSuspended: boolean }> {
    const cleanEmail = (clientEmail || '').trim().toLowerCase();
    const cleanBarberId = (barberId || '').trim();
    if (!cleanEmail || !cleanBarberId) {
      return { totalDistinctBarbers: 0, isSuspended: false };
    }

    const currentBlocks = this.getClientBlocks();
    const alreadyExists = currentBlocks.some(
      (b) => b.clientEmail === cleanEmail && b.barberId === cleanBarberId
    );

    let updatedBlocks = currentBlocks;
    if (!alreadyExists) {
      updatedBlocks = [
        ...currentBlocks,
        {
          clientEmail: cleanEmail,
          barberId: cleanBarberId,
          blockedAt: new Date().toISOString(),
        },
      ];
      this.saveClientBlocks(updatedBlocks);
    }

    // Calcular cuántos barberos distintos han bloqueado a este correo
    const distinctBarbers = new Set(
      updatedBlocks.filter((b) => b.clientEmail === cleanEmail).map((b) => b.barberId)
    );
    const isSuspended = distinctBarbers.size >= 3;

    if (isSuspended && typeof localStorage !== 'undefined') {
      try {
        const suspended = this.getGloballySuspendedEmails();
        suspended.add(cleanEmail);
        localStorage.setItem('barbersync_suspended_emails_v1', JSON.stringify(Array.from(suspended)));
      } catch {}
    }

    // Sincronizar en Supabase en el perfil del barbero (schedule.blocked_clients)
    try {
      const targetIds = [cleanBarberId, cleanBarberId.replace(/^b-/, '')].filter(Boolean);
      for (const tId of targetIds) {
        const { data: bData } = await supabase.from('barbers').select('schedule').eq('id', tId).maybeSingle();
        const sched = (bData?.schedule as any) || {};
        const existingList = Array.isArray(sched.blocked_clients) ? sched.blocked_clients : [];
        if (!existingList.includes(cleanEmail)) {
          const updatedList = [...existingList, cleanEmail];
          await supabase.from('barbers').update({
            schedule: { ...sched, blocked_clients: updatedList }
          }).eq('id', tId);
        }
      }
    } catch (err) {
      console.warn('Error al guardar bloqueo de cliente en Supabase:', err);
    }

    // Si alcanzó los 3 bloqueos, registrar suspensión en profiles si es posible
    if (isSuspended) {
      try {
        await supabase
          .from('profiles')
          .update({
            is_suspended: true,
            suspension_reason: 'multiple_barber_blocks',
            updated_at: new Date().toISOString(),
          })
          .ilike('email', cleanEmail);
      } catch (err) {
        console.warn('Error al suspender cuenta de cliente en profiles:', err);
      }
    }

    return {
      totalDistinctBarbers: distinctBarbers.size,
      isSuspended,
    };
  },

  async unblockClient(barberId: string, clientEmail: string): Promise<void> {
    const cleanEmail = (clientEmail || '').trim().toLowerCase();
    const cleanBarberId = (barberId || '').trim();
    if (!cleanEmail || !cleanBarberId) return;

    const currentBlocks = this.getClientBlocks();
    const filtered = currentBlocks.filter(
      (b) => !(b.clientEmail === cleanEmail && b.barberId === cleanBarberId)
    );
    this.saveClientBlocks(filtered);

    // Si ya no tiene 3 bloqueos, retirar suspensión global
    const remainingDistinct = new Set(
      filtered.filter((b) => b.clientEmail === cleanEmail).map((b) => b.barberId)
    );
    if (remainingDistinct.size < 3 && typeof localStorage !== 'undefined') {
      try {
        const suspended = this.getGloballySuspendedEmails();
        suspended.delete(cleanEmail);
        localStorage.setItem('barbersync_suspended_emails_v1', JSON.stringify(Array.from(suspended)));
      } catch {}
    }

    // Sincronizar en Supabase
    try {
      const targetIds = [cleanBarberId, cleanBarberId.replace(/^b-/, '')].filter(Boolean);
      for (const tId of targetIds) {
        const { data: bData } = await supabase.from('barbers').select('schedule').eq('id', tId).maybeSingle();
        const sched = (bData?.schedule as any) || {};
        const existingList = Array.isArray(sched.blocked_clients) ? sched.blocked_clients : [];
        const updatedList = existingList.filter((e: string) => e !== cleanEmail);
        await supabase.from('barbers').update({
          schedule: { ...sched, blocked_clients: updatedList }
        }).eq('id', tId);
      }
    } catch (err) {
      console.warn('Error al retirar bloqueo en Supabase:', err);
    }
  },

  isClientBlockedByBarber(barberId: string, clientEmail?: string): boolean {
    if (!clientEmail || !barberId) return false;
    const cleanEmail = clientEmail.trim().toLowerCase();
    const cleanBarberId = barberId.trim();

    const blocks = this.getClientBlocks();
    return blocks.some(
      (b) =>
        b.clientEmail === cleanEmail &&
        (b.barberId === cleanBarberId ||
          b.barberId === cleanBarberId.replace(/^b-/, '') ||
          `b-${b.barberId}` === cleanBarberId)
    );
  },

  getClientBlockCount(clientEmail?: string): {
    totalDistinctBarbers: number;
    isBlockedByCurrent: (barberId: string) => boolean;
    isSuspended: boolean;
  } {
    if (!clientEmail) {
      return {
        totalDistinctBarbers: 0,
        isBlockedByCurrent: () => false,
        isSuspended: false,
      };
    }
    const cleanEmail = clientEmail.trim().toLowerCase();
    const blocks = this.getClientBlocks().filter((b) => b.clientEmail === cleanEmail);
    const distinctBarbers = new Set(blocks.map((b) => b.barberId));
    const isSuspended = distinctBarbers.size >= 3 || this.isClientGloballySuspended(cleanEmail);

    return {
      totalDistinctBarbers: distinctBarbers.size,
      isBlockedByCurrent: (barberId: string) =>
        distinctBarbers.has(barberId) ||
        distinctBarbers.has(barberId.replace(/^b-/, '')) ||
        distinctBarbers.has(`b-${barberId}`),
      isSuspended,
    };
  },

  getGloballySuspendedEmails(): Set<string> {
    if (typeof localStorage === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem('barbersync_suspended_emails_v1');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  },

  isClientGloballySuspended(clientEmail?: string): boolean {
    if (!clientEmail) return false;
    const cleanEmail = clientEmail.trim().toLowerCase();
    const suspended = this.getGloballySuspendedEmails();
    if (suspended.has(cleanEmail)) return true;

    // Verificar en lista de bloqueos
    const blocks = this.getClientBlocks().filter((b) => b.clientEmail === cleanEmail);
    const distinctBarbers = new Set(blocks.map((b) => b.barberId));
    return distinctBarbers.size >= 3;
  },

  async setDayRestException(
    barberId: string,
    date: string,
    isRest: boolean
  ): Promise<void> {
    const cached = this.getCachedBarbers();
    const barber = cached.find((b) => b.id === barberId);
    if (!barber) return;

    const wh = barber.workingHours || {
      start: '09:00',
      end: '20:00',
      slotDurationMinutes: 30,
      lunchBreak: { enabled: true, start: '14:00', end: '15:00' },
      workingDays: [1, 2, 3, 4, 5, 6],
      specialDaySchedules: [],
    };

    const currentExceptions = Array.isArray(wh.specialDaySchedules) ? [...wh.specialDaySchedules] : [];
    const filtered = currentExceptions.filter((e) => e.date !== date);

    if (isRest) {
      filtered.push({
        id: `rest-${date}-${Date.now()}`,
        date,
        start: '00:00',
        end: '00:00',
        label: 'Día de Descanso',
        isClosed: true,
        isRestDay: true,
      } as any);
    }

    const updatedWH = {
      ...wh,
      specialDaySchedules: filtered,
    };

    await this.saveBarberAvailabilitySettings({
      barberId: barber.id,
      userId: barber.userId,
      workingHours: updatedWH,
      restDay: (barber.schedule as any)?.rest_day || '0',
      email: barber.email,
      persistToCloud: true,
    });
  },

  async submitSuggestion(
    message: string,
    userEmail?: string | null,
    userRole?: string | null
  ): Promise<{ success: boolean; error?: string }> {
    const cleanMsg = (message || '').trim();
    if (!cleanMsg) {
      return { success: false, error: 'El mensaje no puede estar vacío' };
    }

    let authUserId: string | null = null;
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        authUserId = authData.user.id;
      }
    } catch {}

    const cleanRole = userRole === 'barber' ? 'barber' : 'client';

    const payload = {
      user_id: authUserId,
      user_email: userEmail || null,
      user_role: cleanRole,
      message: cleanMsg,
    };

    // Respaldo seguro en almacenamiento local del cliente
    try {
      const raw = localStorage.getItem('barbersync_suggestions') || '[]';
      const parsed = JSON.parse(raw);
      parsed.unshift({ id: `sug_${Date.now()}`, ...payload, created_at: new Date().toISOString() });
      localStorage.setItem('barbersync_suggestions', JSON.stringify(parsed));
    } catch {}

    // Inserción en Supabase en tabla public.suggestions con columnas exactas
    try {
      const { error } = await supabase.from('suggestions').insert([payload]);
      if (error) {
        console.warn('Supabase insert suggestion notice (respaldo local guardado):', error.message);
      }
    } catch (err: any) {
      console.warn('Supabase submitSuggestion exception:', err?.message);
    }

    return { success: true };
  },

  async getActiveAppointmentsByExactDates(
    barberId: string,
    exactDates: string[],
    barberUserId?: string
  ): Promise<any[]> {
    const cleanDates = Array.from(
      new Set((exactDates || []).map((d) => String(d || '').trim()).filter(Boolean))
    );
    if (cleanDates.length === 0) return [];

    const targetBarberId = String(barberId || '');
    const cleanTargetId = targetBarberId.replace(/^b-/, '').toLowerCase();
    const cleanUserId = String(barberUserId || '').replace(/^b-/, '').toLowerCase();

    const cachedApts = this.getCachedAppointments();
    const localConflicts = cachedApts.filter((apt) => {
      const aptBarberId = String(apt.barberId || (apt as any).barber_id || '');
      const cleanAptBarber = aptBarberId.replace(/^b-/, '').toLowerCase();
      const matchBarber =
        !targetBarberId ||
        aptBarberId === targetBarberId ||
        cleanAptBarber === cleanTargetId ||
        (Boolean(barberUserId) && (aptBarberId === barberUserId || cleanAptBarber === cleanUserId));
      const aptDate = String(apt.date || (apt as any).appointment_date || '').trim();
      if (!matchBarber || apt.status === 'cancelled' || apt.status === 'completed') return false;
      return cleanDates.some((targetDate) => aptDate === targetDate);
    });

    let remoteConflicts: any[] = [];
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .in('date', cleanDates)
        .neq('status', 'cancelled')
        .neq('status', 'completed');

      if (!error && Array.isArray(data)) {
        remoteConflicts = data
          .filter((row: any) => {
            const rowBarberId = String(row.barber_id || row.barberId || '');
            const cleanRowBarber = rowBarberId.replace(/^b-/, '').toLowerCase();
            const matchBarber =
              !targetBarberId ||
              rowBarberId === targetBarberId ||
              cleanRowBarber === cleanTargetId ||
              (Boolean(barberUserId) && (rowBarberId === barberUserId || cleanRowBarber === cleanUserId));
            const rowDate = String(row.date || row.appointment_date || '').trim();
            if (!matchBarber || !rowDate) return false;
            return cleanDates.some((targetDate) => rowDate === targetDate);
          })
          .map((row: any) => ({
            id: row.id,
            clientName: row.client_name || row.clientName || 'Cliente',
            date: String(row.date || row.appointment_date || '').trim(),
            time: row.time || row.appointment_time || '09:00',
            serviceName: row.service_name || row.serviceName || 'Servicio',
            status: row.status,
            barberId: row.barber_id || row.barberId,
          }));
      }
    } catch (err) {
      console.warn('Error consultando citas por fecha exacta en Supabase:', err);
    }

    const mergedMap = new Map<string, any>();
    for (const apt of [...localConflicts, ...remoteConflicts]) {
      if (apt && apt.id) mergedMap.set(String(apt.id), apt);
    }
    return Array.from(mergedMap.values());
  },

  resetToDefaultData(): void {
    localStorage.removeItem(STORAGE_KEYS.BARBERS);
    localStorage.removeItem(STORAGE_KEYS.SERVICES);
    localStorage.removeItem(STORAGE_KEYS.APPOINTMENTS);
    localStorage.removeItem(STORAGE_KEYS.BLOCKED_SLOTS);
    localStorage.removeItem(STORAGE_KEYS.UNBLOCKED_EXCEPTIONS);
  },
};

/**
 * Carga cualquier archivo seleccionado (JPEG, PNG, WebP o AVIF) en un objeto Image/Canvas,
 * lo redimensiona (máx 900x500 px) y lo exporta como Blob WebP (calidad 0.8).
 */
export async function compressImageToWebP(
  input: File | Blob | string,
  maxWidth = 900,
  maxHeight = 500
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let srcUrl = '';
    let shouldRevoke = false;

    if (typeof input === 'string') {
      srcUrl = input;
    } else {
      srcUrl = URL.createObjectURL(input);
      shouldRevoke = true;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (shouldRevoke) {
        URL.revokeObjectURL(srcUrl);
      }

      let width = img.naturalWidth || maxWidth;
      let height = img.naturalHeight || maxHeight;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo inicializar canvas 2D'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Error al generar Blob WebP'));
          }
        },
        'image/webp',
        0.8
      );
    };

    img.onerror = (err) => {
      if (shouldRevoke) {
        URL.revokeObjectURL(srcUrl);
      }
      reject(err);
    };

    img.src = srcUrl;
  });
}

export const uploadBarberMedia = storageService.uploadBarberMedia.bind(storageService);

