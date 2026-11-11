import { Barber, Service } from '../types';
import { supabase } from './supabaseClient';
import { storageService } from './storageService';

const BARBER_PROFILE_KEY_PREFIX = 'barbersync_barber_profile_';

export const barberService = {
  /**
   * Obtiene la clave de almacenamiento local para un usuario barbero específico
   */
  getStorageKey(userId: string): string {
    return `${BARBER_PROFILE_KEY_PREFIX}${userId}`;
  },

  /**
   * Verifica si un barbero ya ha creado/completado el perfil de su negocio consultando estrictamente por user_id
   */
  async hasCreatedBusiness(userId: string): Promise<boolean> {
    if (!userId) return false;

    try {
      const { data, error } = await supabase
        .from('barbers')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) {
        return false;
      }

      const businessName = String(
        data.business_name ||
        data.barbershop_name ||
        data.shop_name ||
        data.schedule?.profile_meta?.business_name ||
        ''
      ).trim();

      return Boolean(data.is_profile_completed && businessName);
    } catch {
      return false;
    }
  },

  /**
   * Requisito 2a & 2b: Obtiene el perfil de barbería asignado a este usuario barbero estrictamente con:
   * supabase.from("barbers").select("*").eq("user_id", userId).single()
   * Si devuelve null o error, inicializa 100% VACÍO sin fallback a mocks ni caché de otros barberos.
   */
  async getBarberProfile(userId: string): Promise<Barber> {
    if (!userId) {
      return storageService.createEmptyBarberProfile('');
    }
    return storageService.getAuthenticatedBarberProfile({ id: userId });
  },

  /**
   * Persistencia real de Barbería en Supabase (1 por barbero) filtrando estrictamente por user_id
   */
  async upsertBarberProfile(
    userId: string,
    barberData: Partial<Barber> & { id: string },
    services?: Service[]
  ): Promise<{ barber: Barber; error?: string }> {
    const res = await storageService.saveBarberProfileToCloud(
      { id: userId },
      barberData,
      services
    );
    return {
      barber: (res.data || storageService.createEmptyBarberProfile(userId)) as Barber,
      error: res.error,
    };
  },
};

