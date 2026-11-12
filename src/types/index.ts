export type Role = 'client' | 'barber';

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'twitter' | 'whatsapp' | 'email' | 'website';

export interface SocialLink {
  id: string;
  platform: SocialPlatform;
  url: string;
}

export interface Barber {
  id: string;
  userId?: string;
  user_id?: string;
  email?: string;
  name: string;
  nickname: string;
  alias?: string;
  avatarColor: string;
  avatarUrl?: string;
  avatar_url?: string;
  coverUrl?: string;
  cover_url?: string;
  rating: number;
  reviewCount: number;
  specialty: string;
  bio: string;
  phone: string;
  instagram: string;
  socialLinks?: SocialLink[];
  barbershopName?: string;
  business_name?: string;
  businessName?: string;
  shop_name?: string;
  address?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  serviceIds?: string[];
  services?: Service[];
  workingDaysText?: string; // e.g. "Lunes a Sábado"
  workingDays?: string; // alias
  openTime?: string;
  closeTime?: string;
  schedule?: {
    workingDays: string;
    openTime: string;
    closeTime: string;
  };
  is_profile_completed?: boolean;
  isProfileCompleted?: boolean;
  workingHours: {
    start: string; // e.g. "08:00"
    end: string;   // e.g. "20:00"
    slotDurationMinutes: number; // e.g. 30 or 45
    lunchBreak: {
      enabled: boolean;
      start: string; // "14:00"
      end: string;   // "15:00"
    };
    workingDays: number[]; // 0 = Sun, 1 = Mon ... 6 = Sat
    specialDaySchedules?: Array<{
      id: string;
      dayOfWeek?: number;
      date?: string;
      start: string;
      end: string;
      label?: string;
    }>;
  };
}

export type ServiceCategory = 'corte' | 'barba' | 'combo' | 'tratamiento';

export interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  durationMinutes: number;
  price: number;
  description: string;
  popular?: boolean;
  barberId?: string;
  barbershopName?: string;
}

export type AuthProvider = 'google' | 'instagram' | 'tiktok' | 'whatsapp' | 'apple' | 'email';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  barberId?: string; // If role === 'barber', references Barber.id
  avatarColor?: string;
  avatarUrl?: string;
  isProfileComplete?: boolean;
  isProfileCompleted?: boolean;
  barberProfile?: Partial<Barber> & Record<string, any>;
  user_metadata?: Record<string, any>;
  authProvider?: AuthProvider;
  socialHandle?: string; // e.g. "@juan_style"
}

export type AppointmentStatus = 'confirmed' | 'completed' | 'cancelled' | 'in_progress';

export interface Appointment {
  id: string;
  code: string; // e.g. "#BS-8421" o "#CO-123456"
  clientId: string; // The authenticated user who owns this appointment
  client_id?: string;
  barberId: string;
  barber_id?: string;
  barberEmail?: string;
  barber_email?: string;
  barberName: string;
  barber_name?: string;
  serviceId: string;
  service_id?: string;
  serviceName: string;
  service_name?: string;
  servicePrice: number;
  service_price?: number;
  price?: number;
  serviceDuration: number;
  duration_minutes?: number;
  date: string; // YYYY-MM-DD
  appointment_date?: string;
  time: string; // HH:mm or "9:00 am"
  appointment_time?: string;
  clientName: string;
  client_name?: string;
  clientPhone: string;
  client_phone?: string;
  clientEmail?: string;
  client_email?: string;
  clientNotes?: string;
  client_notes?: string;
  status: AppointmentStatus;
  cancelledBy?: 'client' | 'barber';
  cancelled_by?: 'client' | 'barber';
  createdAt: string;
  created_at?: string;
  source: 'online' | 'walk_in';
  type?: 'presencial' | 'virtual' | 'web' | 'online' | string;
  rated?: boolean;
  rating?: number;
  review?: string;
  reviewComment?: string;
  review_comment?: string;
  rating_dismissed?: boolean;
  ratingDismissed?: boolean;
}

export interface BlockedSlot {
  id: string;
  barberId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  reason: string; // "Almuerzo", "Personal", "Mantenimiento", etc.
  createdAt: string;
}

export interface RealtimeEvent {
  id: string;
  type: 'NEW_BOOKING' | 'CANCEL_BOOKING' | 'BLOCK_SLOT' | 'UNBLOCK_SLOT' | 'STATUS_CHANGE';
  payload: any;
  timestamp: number;
  actor: 'client' | 'barber';
  message: string;
}
