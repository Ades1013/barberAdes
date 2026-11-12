import { User, Role, Appointment } from '../types';
import { supabase } from './supabaseClient';
import { storageService } from './storageService';

const AUTH_STORAGE_KEYS = {
  CURRENT_USER: 'barbersync_current_user_v1',
};

type AuthListener = (user: User | null) => void;
type RecoveryListener = (isRecovery: boolean) => void;
export interface AuthErrorPayload {
  message: string;
  switchToLogin?: boolean;
  existingRole?: Role;
}
type AuthErrorListener = (error: AuthErrorPayload | null) => void;

class AuthService {
  private currentUser: User | null = null;
  private listeners: Set<AuthListener> = new Set();
  private recoveryListeners: Set<RecoveryListener> = new Set();
  private authErrorListeners: Set<AuthErrorListener> = new Set();
  private lastAuthError: AuthErrorPayload | null = null;
  private passwordRecoveryMode: boolean = false;
  private isRegisteringFlow: boolean = false;
  private isValidatingOAuthCallback: boolean = false;
  private initialized: boolean = false;

  constructor() {
    this.initSession();
    this.listenToSupabaseAuth();
  }

  public emitAuthError(payload: AuthErrorPayload | null) {
    this.lastAuthError = payload;
    if (typeof window !== 'undefined') {
      if (payload) {
        sessionStorage.setItem('barbersync_oauth_error', JSON.stringify(payload));
      } else {
        sessionStorage.removeItem('barbersync_oauth_error');
      }
    }
    this.authErrorListeners.forEach((l) => l(payload));
  }

  public consumeLastAuthError(): AuthErrorPayload | null {
    let err = this.lastAuthError;
    if (!err && typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('barbersync_oauth_error');
        if (raw) {
          err = JSON.parse(raw);
        }
      } catch {}
    }
    this.lastAuthError = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('barbersync_oauth_error');
    }
    return err;
  }

  public subscribeAuthError(listener: AuthErrorListener): () => void {
    this.authErrorListeners.add(listener);
    if (this.lastAuthError) {
      listener(this.lastAuthError);
    }
    return () => this.authErrorListeners.delete(listener);
  }

  /**
   * Obtiene el origen público limpio sin parámetros de applet-auth-bridge ni aistudio.google.com
   */
  public getCleanRedirectOrigin(): string {
    if (typeof window === 'undefined') return '';
    let rawOrigin = window.location.origin || '';
    if (rawOrigin.includes('applet-auth-bridge') || rawOrigin.includes('aistudio.google.com')) {
      try {
        const params = new URLSearchParams(window.location.search);
        const candidate = params.get('origin') || params.get('redirect_uri') || params.get('app_url');
        if (candidate && !candidate.includes('applet-auth-bridge') && !candidate.includes('aistudio.google.com')) {
          rawOrigin = new URL(candidate).origin;
        } else {
          rawOrigin = 'https://ais-pre-5h556j7spmywgm6mdcvapw-89184573351.us-west2.run.app';
        }
      } catch {
        rawOrigin = 'https://ais-pre-5h556j7spmywgm6mdcvapw-89184573351.us-west2.run.app';
      }
    }
    return rawOrigin
      .replace(/\/applet-auth-bridge.*$/i, '')
      .split('?')[0]
      .split('#')[0]
      .replace(/\/+$/, '');
  }

  /**
   * Cierra cualquier sesión residual previa en Supabase y limpia el estado local antes de procesar un registro
   */
  public async clearResidualSessionBeforeRegister(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch {}
    if (typeof window !== 'undefined') {
      const qrBarber = localStorage.getItem('barberades_qr_barber');
      localStorage.clear();
      if (qrBarber) {
        localStorage.setItem('barberades_qr_barber', qrBarber);
      }
    }
    this.currentUser = null;
    this.notify();
  }

  /**
   * Captura parámetros de intención OAuth si vienen en la URL de retorno y los sincroniza en sessionStorage
   */
  private captureOAuthIntentFromUrl(searchStr?: string) {
    if (typeof window === 'undefined') return;
    try {
      const search = searchStr ?? window.location.search ?? '';
      if (!search) return;
      const params = new URLSearchParams(search);
      const qrBarber = params.get('barber');
      if (qrBarber) {
        localStorage.setItem('barberades_qr_barber', qrBarber);
      }
      const urlIntentRole = params.get('auth_intent_role') || params.get('auth_role');
      const urlIntentAction = params.get('auth_intent_action');
      if (urlIntentAction === 'login' || urlIntentAction === 'register') {
        sessionStorage.setItem('auth_intent_action', urlIntentAction);
        if (urlIntentAction === 'login') {
          sessionStorage.removeItem('auth_intent_role');
          return;
        }
      }
      if ((urlIntentRole === 'client' || urlIntentRole === 'barber') && !sessionStorage.getItem('auth_intent_role')) {
        sessionStorage.setItem('auth_intent_role', urlIntentRole);
      }
    } catch {}
  }

  private async initSession() {
    if (typeof window === 'undefined') return;

    this.captureOAuthIntentFromUrl();

    // 1. Try restoring from localStorage cache for instant UI availability
    const savedUser = localStorage.getItem(AUTH_STORAGE_KEYS.CURRENT_USER);
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
      } catch {
        this.currentUser = null;
      }
    }

    // 2. Manejo de callback en la ventana principal si la redirección ocurre directamente en ella
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';

      // Detectar enlace de recuperación de contraseña (PASSWORD_RECOVERY) desde el correo
      if (hash.includes('type=recovery') || search.includes('type=recovery')) {
        this.setPasswordRecoveryMode(true);
      }

      if (hash.includes('access_token=') || search.includes('code=')) {
        try {
          if (hash.includes('access_token=')) {
            const params = new URLSearchParams(hash.replace(/^#/, ''));
            if (params.get('type') === 'recovery') {
              this.setPasswordRecoveryMode(true);
            }
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            if (accessToken && refreshToken) {
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
            }
          }
          // Limpiar parámetros residuales de la barra de direcciones sin recargar la página
          const cleanUrl = window.location.href.split('#')[0].split('?')[0];
          window.history.replaceState({}, document.title, cleanUrl);
          await supabase.auth.getSession();
        } catch (err) {
          console.warn('Error processing OAuth hash in main window:', err);
        }
      }
    }

    // 3. Reconcile with real Supabase Auth session
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('Supabase getSession error:', error.message);
        this.saveCurrentSession(null);
      } else if (session?.user) {
        const activeUser = session.user;
        const user = await this.resolveAndSyncUserRole(activeUser);
        if (user) {
          this.saveCurrentSession(user);
          if (user.role === 'barber') {
            storageService.fetchAndSyncUserProfile(activeUser).catch(() => {});
          }
        } else {
          this.saveCurrentSession(null);
        }
      } else {
        // No active session in Supabase: clear any stale cache and strictly set null
        this.saveCurrentSession(null);
      }
    } catch (err) {
      console.warn('Error initializing Supabase Auth session:', err);
      this.saveCurrentSession(null);
    } finally {
      this.initialized = true;
      this.notify();
    }
  }

  private listenToSupabaseAuth() {
    if (typeof window === 'undefined') return;

    try {
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          this.setPasswordRecoveryMode(true);
          if (session?.user) {
            const appUser = await this.resolveAndSyncUserRole(session.user);
            if (appUser) this.saveCurrentSession(appUser);
          }
          return;
        }

        if (event === 'SIGNED_OUT') {
          this.setPasswordRecoveryMode(false);
          this.saveCurrentSession(null);
          return;
        }

        if (event === 'SIGNED_IN') {
          if (this.isRegisteringFlow || this.isValidatingOAuthCallback) {
            return;
          }
          if (typeof window !== 'undefined' && (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery'))) {
            this.setPasswordRecoveryMode(true);
            return;
          }
          if (this.passwordRecoveryMode) {
            return;
          }

          this.captureOAuthIntentFromUrl();

          // Limpiar parámetros residuales de la barra de direcciones sin recargar la página
          if (typeof window !== 'undefined' && (window.location.hash.includes('access_token=') || window.location.search.includes('code='))) {
            const cleanUrl = window.location.href.split('#')[0].split('?')[0];
            window.history.replaceState({}, document.title, cleanUrl);
          }

          if (session?.user) {
            const activeUser = session.user;
            if (activeUser.email && storageService.isClientGloballySuspended(activeUser.email)) {
              await supabase.auth.signOut();
              localStorage.clear();
              this.saveCurrentSession(null);
              return;
            }

            const hasPendingIntent = Boolean(
              typeof window !== 'undefined' &&
                (sessionStorage.getItem('auth_intent_action') || sessionStorage.getItem('auth_intent_role'))
            );

            // Si no hay un intent OAuth pendiente y el usuario actual ya está autenticado con el mismo ID, evitar recargas innecesarias
            if (
              !hasPendingIntent &&
              this.currentUser &&
              this.currentUser.id === activeUser.id &&
              this.currentUser.email?.toLowerCase() === activeUser.email?.toLowerCase()
            ) {
              return;
            }

            this.isValidatingOAuthCallback = true;
            try {
              const appUser = await this.resolveAndSyncUserRole(activeUser);
              if (!appUser) {
                // La validación estricta de rol o registro rechazó el acceso y cerró la sesión
                this.saveCurrentSession(null);
                return;
              }
              this.saveCurrentSession(appUser);

              if (appUser.role === 'barber') {
                storageService.fetchAndSyncUserProfile(activeUser).catch(() => {});
              }
            } finally {
              this.isValidatingOAuthCallback = false;
            }
          }
        } else if (event === 'TOKEN_REFRESHED') {
          return;
        } else if (event === 'USER_UPDATED') {
          if (session?.user && !this.isValidatingOAuthCallback) {
            const activeUser = session.user;
            const appUser = await this.resolveAndSyncUserRole(activeUser);
            if (
              appUser &&
              (!this.currentUser ||
                this.currentUser.id !== appUser.id ||
                this.currentUser.email !== appUser.email ||
                this.currentUser.avatarUrl !== appUser.avatarUrl ||
                this.currentUser.name !== appUser.name ||
                this.currentUser.role !== appUser.role)
            ) {
              this.saveCurrentSession(appUser);
            }
          }
        }
      });

      // Sincronización instantánea tras la autenticación en ventana emergente (popup)
      window.addEventListener('message', async (event) => {
        if (event.data?.type === 'BARBERSYNC_SUPABASE_AUTH_CALLBACK') {
          const { hash, search } = event.data;
          if (search) {
            this.captureOAuthIntentFromUrl(String(search));
          }
          if (hash) {
            try {
              const params = new URLSearchParams(hash.replace(/^#/, ''));
              const isRecovery = params.get('type') === 'recovery' || String(hash).includes('type=recovery') || String(search || '').includes('type=recovery');
              const accessToken = params.get('access_token');
              const refreshToken = params.get('refresh_token');
              if (accessToken && refreshToken) {
                await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken,
                });
              }
              if (isRecovery) {
                this.setPasswordRecoveryMode(true);
                return;
              }
            } catch {}
          }
          if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
            const cleanUrl = window.location.href.split('#')[0].split('?')[0];
            window.history.replaceState({}, document.title, cleanUrl);
          }
          await supabase.auth.getSession();
          await this.refreshSession();
        }
      });

      // Escuchar eventos hashchange en caso de que el hash #access_token=...&type=recovery se agregue en caliente
      window.addEventListener('hashchange', async () => {
        const hash = window.location.hash || '';
        if (hash.includes('access_token=') && hash.includes('type=recovery')) {
          try {
            const params = new URLSearchParams(hash.replace(/^#/, ''));
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            if (accessToken && refreshToken) {
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
            }
            const cleanUrl = window.location.href.split('#')[0].split('?')[0];
            window.history.replaceState({}, document.title, cleanUrl);
            this.setPasswordRecoveryMode(true);
          } catch {}
        }
      });

      // Escuchar eventos storage en caso de que otra pestaña/popup actualice el token de Supabase
      window.addEventListener('storage', async (e) => {
        if (e.key && (e.key.includes('-auth-token') || e.key === 'barbersync_oauth_hash_exchange')) {
          if (e.key === 'barbersync_oauth_hash_exchange' && e.newValue) {
            try {
              const params = new URLSearchParams(e.newValue.replace(/^#/, ''));
              const isRecovery = params.get('type') === 'recovery' || e.newValue.includes('type=recovery');
              const accessToken = params.get('access_token');
              const refreshToken = params.get('refresh_token');
              if (accessToken && refreshToken) {
                await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken,
                });
              }
              localStorage.removeItem('barbersync_oauth_hash_exchange');
              if (isRecovery) {
                this.setPasswordRecoveryMode(true);
                return;
              }
            } catch {}
          }
          await supabase.auth.getSession();
          await this.refreshSession();
        }
      });
    } catch (err) {
      console.warn('Failed to listen to Supabase onAuthStateChange:', err);
    }
  }

  /**
   * Sincroniza la sesión actual de Supabase y notifica a todos los oyentes de la app
   */
  public async refreshSession(): Promise<User | null> {
    if (this.isValidatingOAuthCallback) return this.currentUser;
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!error && session?.user) {
        const appUser = await this.resolveAndSyncUserRole(session.user);
        if (!appUser) {
          this.saveCurrentSession(null);
          return null;
        }
        this.saveCurrentSession(appUser);
        if (appUser.role === 'barber') {
          storageService.fetchAndSyncUserProfile(session.user).catch(() => {});
        }
        return appUser;
      }
    } catch (err) {
      console.warn('Error refreshing session in authService:', err);
    }
    return null;
  }

  /**
   * Requisito 1 & 2: Validación de Rol en Login/Registro, persistencia en user_metadata y public.profiles (sin errores 400 ni 406)
   */
  public async resolveAndSyncUserRole(
    sbUser: any,
    explicitRole?: Role | null,
    explicitAction?: 'login' | 'register'
  ): Promise<User | null> {
    const meta = sbUser.user_metadata || {};
    const email = sbUser.email || meta.email || '';
    const cleanEmail = email.toLowerCase().trim();
    const userName = meta.full_name || meta.name || cleanEmail.split('@')[0] || 'Usuario';
    const phone = meta.phone || sbUser.phone || '';
    const avatarColor = meta.avatar_color || 'from-amber-600 to-amber-700';
    const avatarUrl = meta.avatar_url;

    // 1. Leer intención guardada en sessionStorage ('auth_intent_role' y 'auth_intent_action')
    let intentRole: Role | null = explicitRole || null;
    let intentAction: 'login' | 'register' | null = explicitAction || null;
    if (typeof window !== 'undefined') {
      const rawIntentAction = sessionStorage.getItem('auth_intent_action');
      const rawIntentRole = sessionStorage.getItem('auth_intent_role');
      if (!intentAction && (rawIntentAction === 'login' || rawIntentAction === 'register')) {
        intentAction = rawIntentAction;
      }
      if (intentAction === 'login') {
        intentRole = null;
      } else if (!intentRole && (rawIntentRole === 'client' || rawIntentRole === 'barber')) {
        intentRole = rawIntentRole;
      }
    }

    const consumeIntent = () => {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('auth_intent_role');
        sessionStorage.removeItem('auth_intent_action');
        localStorage.removeItem('barbersync_pending_role');
        localStorage.removeItem('pending_auth_role');
        localStorage.removeItem('barbersync_pending_oauth_role');
        localStorage.removeItem('barbersync_pending_oauth_action');
      }
    };

    // 2. Consultar 'public.profiles' usando '.maybeSingle()' y '.select("*")' para evitar errores HTTP 400 y 406
    let existingProfile: any = null;
    try {
      const { data: profById, error: errById } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sbUser.id)
        .maybeSingle();

      if (!errById && profById) {
        existingProfile = profById;
      } else if (cleanEmail) {
        const { data: profByEmail, error: errByEmail } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', cleanEmail)
          .limit(1)
          .maybeSingle();
        if (!errByEmail && profByEmail) {
          existingProfile = profByEmail;
        }
      }
    } catch (err) {
      console.warn('Error querying public.profiles in resolveAndSyncUserRole:', err);
    }

    // Consultar 'public.barbers' reemplazando '.single()' por '.maybeSingle()' para evitar error HTTP 406
    let existingBarberRow: any = null;
    try {
      const { data: barberData, error: barberErr } = await supabase
        .from('barbers')
        .select('*')
        .eq('user_id', sbUser.id)
        .maybeSingle();
      if (!barberErr && barberData) {
        existingBarberRow = barberData;
      }
    } catch {}

    // Si existía en public.barbers por user_id pero aún no tenía fila en public.profiles, tratar su rol existente como 'barber'
    if (!existingProfile && existingBarberRow && !this.isRegisteringFlow) {
      existingProfile = {
        id: sbUser.id,
        user_id: sbUser.id,
        email: cleanEmail,
        role: 'barber',
        name: existingBarberRow.name || userName,
      };
    }

    // 3. Si el perfil YA EXISTE en la base de datos (y no es el flujo inmediato de creación por correo recién validado):
    if (existingProfile && !this.isRegisteringFlow) {
      const rawExistingRole =
        existingProfile.role ||
        meta.role ||
        meta.barbersync_role ||
        (existingBarberRow ? 'barber' : 'client');
      const existingRole: Role = rawExistingRole === 'barber' ? 'barber' : 'client';

      // Bloquear ÚNICAMENTE si el usuario estaba en la pestaña "Registrarme" (auth_intent_action === "register") con un correo que ya existe
      if (intentAction === 'register') {
        consumeIntent();
        try {
          await supabase.auth.signOut();
        } catch {}
        if (typeof window !== 'undefined') {
          localStorage.clear();
        }
        this.currentUser = null;
        this.emitAuthError({
          message: "Esta cuenta de Google ya está registrada. Por favor inicia sesión desde la pestaña 'Tengo cuenta'",
          switchToLogin: true,
          existingRole,
        });
        this.notify();
        return null;
      }

      // En login ('auth_intent_action === "login"') o restauración de sesión: NO bloquear al usuario ni exigirle elegir un rol.
      // Leer su rol directamente desde public.profiles.role (o fallback user.user_metadata.role). Nunca cambiar su rol original.
      consumeIntent();
      const finalRole: Role = existingRole;
      if (typeof window !== 'undefined') {
        localStorage.setItem('barbersync_active_role', finalRole);
      }

      const emptyBarberFallback = storageService.createEmptyBarberProfile(sbUser.id, cleanEmail);
      const resolvedBarberProfile =
        finalRole === 'barber' ? (existingBarberRow || emptyBarberFallback) : undefined;
      const isCompleted =
        finalRole === 'barber'
          ? Boolean(
              existingBarberRow &&
                (existingBarberRow.business_name || existingBarberRow.barbershop_name || existingBarberRow.shop_name) &&
                existingBarberRow.address &&
                (existingBarberRow.phone || existingBarberRow.whatsapp)
            )
          : true;

      const authProvider = (sbUser.app_metadata?.provider || 'email') as import('../types').AuthProvider;
      return {
        id: sbUser.id,
        name: existingProfile.name || existingProfile.full_name || existingBarberRow?.name || userName,
        email: cleanEmail || email,
        phone: existingBarberRow?.phone || existingProfile.phone || phone,
        role: finalRole,
        barberId: finalRole === 'barber' ? (existingBarberRow?.id || sbUser.id) : undefined,
        avatarColor,
        avatarUrl: existingBarberRow?.avatar_url || avatarUrl,
        isProfileComplete: isCompleted,
        isProfileCompleted: isCompleted,
        barberProfile: resolvedBarberProfile,
        user_metadata: { ...meta, role: finalRole },
        authProvider: authProvider === 'google' ? 'google' : 'email',
      };
    }

    // 4. Si es un usuario nuevo (por Correo o por Google OAuth en modo registro) o en login inicial sin fila en profiles:
    const selectedRole: Role =
      intentAction === 'register'
        ? (intentRole === 'barber' || explicitRole === 'barber' ? 'barber' : 'client')
        : (existingProfile?.role === 'barber' ||
            meta.role === 'barber' ||
            meta.barbersync_role === 'barber' ||
            explicitRole === 'barber' ||
            intentRole === 'barber'
            ? 'barber'
            : 'client');

    consumeIntent();

    if (typeof window !== 'undefined') {
      localStorage.setItem('barbersync_active_role', selectedRole);
    }

    // Requisito 2a: Guardar el rol inmediatamente en los metadatos nativos de autenticación de Supabase
    try {
      await supabase.auth.updateUser({
        data: { role: selectedRole },
      });
    } catch (err) {
      console.warn('Error updating user_metadata.role in Supabase Auth:', err);
    }

    // Requisito 2b: Hacer upsert en 'public.profiles' enviando únicamente las columnas válidas:
    // { id: user.id, user_id: user.id, email: user.email, role: selectedRole, name: userName }
    try {
      const { error: upsertErr } = await supabase.from('profiles').upsert({
        id: sbUser.id,
        user_id: sbUser.id,
        email: cleanEmail,
        role: selectedRole,
        name: userName,
      });
      if (upsertErr) {
        // Fallback limpio si la tabla public.profiles no tiene la columna user_id
        await supabase.from('profiles').upsert({
          id: sbUser.id,
          email: cleanEmail,
          role: selectedRole,
          name: userName,
        });
      }
    } catch (err) {
      console.warn('Error upserting profile in public.profiles:', err);
    }

    const newBarberProfile =
      selectedRole === 'barber'
        ? (existingBarberRow || storageService.createEmptyBarberProfile(sbUser.id, cleanEmail))
        : undefined;

    const isNewBarberComplete =
      selectedRole === 'barber'
        ? Boolean(
            existingBarberRow &&
              (existingBarberRow.business_name || existingBarberRow.barbershop_name) &&
              existingBarberRow.address &&
              (existingBarberRow.phone || existingBarberRow.whatsapp)
          )
        : true;

    const authProvider = (sbUser.app_metadata?.provider || 'email') as import('../types').AuthProvider;

    return {
      id: sbUser.id,
      name: userName,
      email: cleanEmail || email,
      phone: selectedRole === 'barber' ? (existingBarberRow?.phone || '') : phone,
      role: selectedRole,
      barberId: selectedRole === 'barber' ? sbUser.id : undefined,
      avatarColor,
      avatarUrl,
      isProfileComplete: isNewBarberComplete,
      isProfileCompleted: isNewBarberComplete,
      barberProfile: newBarberProfile,
      user_metadata: { ...meta, role: selectedRole },
      authProvider: authProvider === 'google' ? 'google' : 'email',
    };
  }

  public mapSupabaseUserToAppUser(sbUser: any): User {
    const meta = sbUser.user_metadata || {};
    const email = sbUser.email || meta.email || '';
    const name = meta.full_name || meta.name || email.split('@')[0] || 'Usuario';
    const phone = meta.phone || sbUser.phone || '';
    const avatarColor = meta.avatar_color || 'from-amber-600 to-amber-700';
    const avatarUrl = meta.avatar_url;
    const activeStoredRole = (typeof localStorage !== 'undefined' ? localStorage.getItem('barbersync_active_role') : null) as Role | null;
    const role: Role = activeStoredRole || (meta.role === 'barber' ? 'barber' : 'client');
    const barberId = role === 'barber' ? sbUser.id : undefined;
    const authProvider = (sbUser.app_metadata?.provider || 'email') as import('../types').AuthProvider;

    return {
      id: sbUser.id || `usr-${Date.now()}`,
      name,
      email,
      phone,
      role,
      barberId,
      avatarColor,
      avatarUrl,
      isProfileComplete: false,
      isProfileCompleted: false,
      barberProfile: undefined,
      user_metadata: meta,
      authProvider: authProvider === 'google' ? 'google' : 'email',
    };
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  private saveCurrentSession(user: User | null) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      localStorage.setItem('barbersync_active_role', user.role || 'client');
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem('barbersync_active_role');
    }
    this.notify();
  }

  public updateCurrentUser(updates: Partial<User>) {
    if (!this.currentUser) return;
    const updated = { ...this.currentUser, ...updates };
    this.saveCurrentSession(updated);
  }

  public subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public isPasswordRecovery(): boolean {
    return this.passwordRecoveryMode;
  }

  public setPasswordRecoveryMode(active: boolean) {
    this.passwordRecoveryMode = active;
    this.recoveryListeners.forEach((l) => l(this.passwordRecoveryMode));
  }

  public subscribeRecovery(listener: RecoveryListener): () => void {
    this.recoveryListeners.add(listener);
    if (this.passwordRecoveryMode) {
      listener(true);
    }
    return () => this.recoveryListeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l(this.currentUser));
  }

  /**
   * Requisito 2: Enviar correo oficial de recuperación de contraseña en Supabase
   * usando la URL pública directa del origen (window.location.origin) sin applet-auth-bridge ni aistudio.google.com
   */
  public async resetPasswordForEmail(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        return { success: false, error: 'Por favor ingresa un correo electrónico válido.' };
      }

      const cleanRedirectTo = this.getCleanRedirectOrigin();

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: cleanRedirectTo,
      });

      if (error) {
        return { success: false, error: this.translateAuthError(error.message) };
      }
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: this.translateAuthError(err?.message || 'Error al enviar el correo de recuperación'),
      };
    }
  }

  /**
   * Flujo alternativo para procesar enlaces o hashes '#access_token=...&type=recovery' si el navegador bloqueó la redirección
   */
  public async processRecoveryLinkOrHash(rawInput: string): Promise<{ success: boolean; error?: string }> {
    try {
      const trimmed = (rawInput || '').trim();
      if (!trimmed) {
        return { success: false, error: 'Por favor pega el enlace de recuperación recibido en tu correo.' };
      }

      let hashFragment = trimmed;
      if (trimmed.includes('#')) {
        hashFragment = trimmed.substring(trimmed.indexOf('#') + 1);
      } else if (trimmed.includes('?')) {
        hashFragment = trimmed.substring(trimmed.indexOf('?') + 1);
      }

      const params = new URLSearchParams(hashFragment.replace(/^#/, ''));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const tokenHash = params.get('token_hash') || params.get('token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          return { success: false, error: this.translateAuthError(error.message) };
        }
        this.setPasswordRecoveryMode(true);
        return { success: true };
      }

      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (error) {
          return { success: false, error: this.translateAuthError(error.message) };
        }
        this.setPasswordRecoveryMode(true);
        return { success: true };
      }

      return {
        success: false,
        error: 'El enlace ingresado no contiene un token de recuperación válido (#access_token=...&type=recovery).',
      };
    } catch (err: any) {
      return {
        success: false,
        error: this.translateAuthError(err?.message || 'No se pudo validar el enlace de recuperación.'),
      };
    }
  }

  /**
   * Requisito 2: Actualizar contraseña en Supabase tras abrir el enlace de recuperación (PASSWORD_RECOVERY)
   */
  public async updateUserPassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!newPassword || newPassword.length < 6) {
        return { success: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
      }

      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { success: false, error: this.translateAuthError(error.message) };
      }

      this.setPasswordRecoveryMode(false);
      if (data?.user) {
        const appUser = await this.resolveAndSyncUserRole(data.user);
        this.saveCurrentSession(appUser);
      }
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: this.translateAuthError(err?.message || 'Error al actualizar la contraseña'),
      };
    }
  }

  /**
   * Real Supabase OAuth Login with Google
   * Requisito 1: Si action === 'login', guarda estrictamente auth_intent_action = 'login' y elimina auth_intent_role
   */
  public async signInWithGoogle(
    role?: Role,
    action: 'login' | 'register' = 'login'
  ): Promise<{ error?: string }> {
    try {
      const cleanOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const cleanPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const intentAction: 'login' | 'register' = action === 'register' ? 'register' : 'login';
      const intentRole: Role = role === 'barber' ? 'barber' : 'client';

      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('auth_intent_action', intentAction);
          if (intentAction === 'login') {
            sessionStorage.removeItem('auth_intent_role');
          } else {
            sessionStorage.setItem('auth_intent_role', intentRole);
          }
        } catch {}
        try {
          if (intentAction === 'login') {
            localStorage.removeItem('barbersync_pending_role');
            localStorage.removeItem('pending_auth_role');
            localStorage.removeItem('barbersync_pending_oauth_role');
            localStorage.setItem('barbersync_pending_oauth_action', 'login');
          } else {
            localStorage.setItem('barbersync_pending_role', intentRole);
            localStorage.setItem('pending_auth_role', intentRole);
            localStorage.setItem('barbersync_pending_oauth_role', intentRole);
            localStorage.setItem('barbersync_pending_oauth_action', 'register');
          }
        } catch {}
      }

      // 1. Configuración dinámica de redirectTo según la acción ('login' vs 'register')
      const redirectUrl =
        intentAction === 'login'
          ? `${cleanOrigin}${cleanPath}?auth_intent_action=login`
          : `${cleanOrigin}${cleanPath}?auth_intent_role=${intentRole}&auth_intent_action=register&auth_role=${intentRole}`;

      // 2. Registro de depuración en consola:
      console.log('[BarberAdes Auth] URL de retorno enviada a Supabase:', redirectUrl);

      // Detección de entorno incrustado (iframe):
      let isIframe = false;
      try {
        isIframe = typeof window !== 'undefined' && window.self !== window.top;
      } catch {
        isIframe = true;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
            access_type: 'online',
          },
        },
      });

      if (error) {
        return { error: this.translateAuthError(error.message) };
      }

      if (!data?.url) {
        return { error: 'No se pudo obtener la URL de autenticación con Google.' };
      }

      // 3. Apertura en ventana emergente y sincronización inmediata de sesión:
      if (isIframe) {
        const popup = window.open(
          data.url,
          '_blank',
          'width=500,height=600,menubar=no,toolbar=no,location=yes,status=no'
        );

        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.open(data.url, '_blank');
        } else {
          // Captura y cierre inmediato del popup tras recibir el token
          const timer = setInterval(async () => {
            try {
              if (!popup || popup.closed) {
                clearInterval(timer);
                await supabase.auth.getSession();
                await this.refreshSession();
                return;
              }

              // Inspeccionar cuando la ventana hija contenga '#access_token=' o '?code='
              try {
                const currentHref = popup.location.href || '';
                const currentHash = popup.location.hash || '';
                const currentSearch = popup.location.search || '';

                if (
                  currentHash.includes('access_token=') ||
                  currentHref.includes('access_token=') ||
                  currentSearch.includes('code=')
                ) {
                  clearInterval(timer);

                  // Reasegurar la intención en sessionStorage antes de setSession / refreshSession
                  try {
                    sessionStorage.setItem('auth_intent_action', intentAction);
                    if (intentAction === 'login') {
                      sessionStorage.removeItem('auth_intent_role');
                    } else {
                      sessionStorage.setItem('auth_intent_role', intentRole);
                    }
                  } catch {}

                  if (currentHash.includes('access_token=') || currentHref.includes('access_token=')) {
                    const rawHash = currentHash || currentHref.substring(currentHref.indexOf('#'));
                    const params = new URLSearchParams(rawHash.replace(/^#/, ''));
                    const accessToken = params.get('access_token');
                    const refreshToken = params.get('refresh_token');
                    if (accessToken && refreshToken) {
                      await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                      });
                    }
                  }

                  // Cerrar la ventana emergente ('popup.close()') de inmediato
                  try {
                    popup.close();
                  } catch {}

                  // Ejecutar inmediatamente getSession y actualizar estado de usuario autenticado
                  await supabase.auth.getSession();
                  await this.refreshSession();
                }
              } catch (crossOriginErr) {
                // Cross-Origin restriction mientras el popup está en Google o Supabase
              }
            } catch {
              clearInterval(timer);
            }
          }, 250);
        }
      } else {
        // Si no está en un iframe (sitio en pestaña normal): realiza la redirección estándar
        window.location.href = data.url;
      }

      return {};
    } catch (err: any) {
      return { error: this.translateAuthError(err?.message || 'Error al conectar con Google') };
    }
  }

  /**
   * Requisito 1 & 2: Valida en public.profiles y public.barbers si un correo ya se encuentra registrado (usando maybeSingle / select('*'))
   */
  public async checkEmailExists(email: string): Promise<{ exists: boolean; role?: Role; name?: string }> {
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) return { exists: false };

      // 1. Consultar en public.profiles con select('*') y maybeSingle()
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', cleanEmail)
        .limit(1)
        .maybeSingle();

      if (!profileErr && profileData) {
        return {
          exists: true,
          role: (profileData.role === 'barber' ? 'barber' : 'client') as Role,
          name: profileData.name || profileData.full_name,
        };
      }

      // 2. Consultar en public.barbers con maybeSingle()
      const { data: barberData, error: barberErr } = await supabase
        .from('barbers')
        .select('id, email, name')
        .ilike('email', cleanEmail)
        .limit(1)
        .maybeSingle();

      if (!barberErr && barberData) {
        return {
          exists: true,
          role: 'barber',
          name: barberData.name,
        };
      }

      return { exists: false };
    } catch (err) {
      console.warn('Error verificando existencia de correo:', err);
      return { exists: false };
    }
  }

  /**
   * Real Supabase Email & Password Sign Up
   * Requisito 2: Guarda inmediatamente el rol en user_metadata y en public.profiles enviando únicamente columnas válidas
   */
  public async signUpWithEmail(
    email: string,
    password: string,
    fullName: string,
    phone?: string,
    role: Role = 'client'
  ): Promise<{ user?: User; error?: string; needsEmailConfirmation?: boolean; emailExists?: boolean }> {
    const DUPLICATE_EMAIL_ALERT =
      "Ya existe una cuenta con este correo electrónico. Por favor, inicia sesión en la pestaña 'Tengo cuenta'";

    const selectedRole: Role = role === 'barber' ? 'barber' : 'client';
    this.isRegisteringFlow = true;
    try {
      const cleanEmail = email.trim().toLowerCase();
      const userName = fullName.trim();

      // a) Cerrar cualquier sesión residual previa (supabase.auth.signOut()) y limpiar estado local
      await this.clearResidualSessionBeforeRegister();

      // b) Consultar en la base de datos (public.profiles o public.barbers) si el correo ingresado ya existe
      const check = await this.checkEmailExists(cleanEmail);
      if (check.exists) {
        return {
          error: DUPLICATE_EMAIL_ALERT,
          emailExists: true,
        };
      }

      try {
        sessionStorage.setItem('auth_intent_role', selectedRole);
        sessionStorage.setItem('auth_intent_action', 'register');
      } catch {}

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: userName,
            name: userName,
            phone: phone?.trim() || '',
            role: selectedRole,
            barbersync_role: selectedRole,
          },
        },
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('already registered') || msg.includes('user already exists') || msg.includes('duplicate')) {
          await this.clearResidualSessionBeforeRegister();
          return {
            error: DUPLICATE_EMAIL_ALERT,
            emailExists: true,
          };
        }
        return { error: this.translateAuthError(error.message) };
      }

      if (data.user) {
        // En Supabase, si el usuario ya existía previamente, identities viene vacío
        if (data.user.identities && data.user.identities.length === 0) {
          await this.clearResidualSessionBeforeRegister();
          return {
            error: DUPLICATE_EMAIL_ALERT,
            emailExists: true,
          };
        }

        // Requisito 2a: Guardar el rol inmediatamente en los metadatos nativos de autenticación de Supabase
        if (data.session) {
          try {
            await supabase.auth.updateUser({
              data: { role: selectedRole },
            });
          } catch {}
        }

        // Requisito 2b: Hacer upsert en 'public.profiles' enviando únicamente las columnas válidas:
        // { id: user.id, user_id: user.id, email: user.email, role: selectedRole, name: userName }
        try {
          const { error: upsertErr } = await supabase.from('profiles').upsert({
            id: data.user.id,
            user_id: data.user.id,
            email: cleanEmail,
            role: selectedRole,
            name: userName,
          });
          if (upsertErr) {
            await supabase.from('profiles').upsert({
              id: data.user.id,
              email: cleanEmail,
              role: selectedRole,
              name: userName,
            });
          }
        } catch {}

        const isConfirmed = !!data.user.email_confirmed_at;
        const hasSession = !!data.session;

        if (!hasSession || !isConfirmed) {
          return { needsEmailConfirmation: true };
        }

        const appUser = await this.resolveAndSyncUserRole(data.user, selectedRole, 'register');
        if (!appUser) {
          const authErr = this.consumeLastAuthError();
          return {
            error: authErr?.message || DUPLICATE_EMAIL_ALERT,
            emailExists: true,
          };
        }
        this.saveCurrentSession(appUser);
        return { user: appUser };
      }

      return { error: 'No se pudo crear la cuenta.' };
    } catch (err: any) {
      return { error: this.translateAuthError(err?.message || 'Error al registrar usuario') };
    } finally {
      this.isRegisteringFlow = false;
    }
  }

  /**
   * Real Supabase Email & Password Sign In
   * Requisito 1: Guarda estrictamente auth_intent_action = 'login' (y elimina cualquier auth_intent_role),
   * autenticando al usuario y leyendo su rol directamente desde public.profiles o user.user_metadata.role sin bloquearlo.
   */
  public async signInWithEmail(
    email: string,
    password: string
  ): Promise<{ user?: User; error?: string; isEmailNotConfirmed?: boolean }> {
    try {
      const cleanEmail = email.trim().toLowerCase();

      // Regla de 3 bloqueos: Inhabilitar acceso a cuentas con 3 o más bloqueos de barberos
      if (storageService.isClientGloballySuspended(cleanEmail)) {
        return {
          error: 'Tu cuenta ha sido inhabilitada por reiterados bloqueos reportados por varios barberos.',
        };
      }

      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('auth_intent_action', 'login');
          sessionStorage.removeItem('auth_intent_role');
        } catch {}
      }

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 8000)
      );
      const loginPromise = supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      const { data, error } = (await Promise.race([
        loginPromise,
        timeoutPromise,
      ])) as any;

      if (error) {
        const isNotConfirmed =
          error.message.toLowerCase().includes('email not confirmed') ||
          error.message.toLowerCase().includes('not confirmed');
        return {
          error: this.translateAuthError(error.message),
          isEmailNotConfirmed: isNotConfirmed,
        };
      }

      if (data.user) {
        if (storageService.isClientGloballySuspended(data.user.email)) {
          await supabase.auth.signOut();
          this.saveCurrentSession(null);
          return {
            error: 'Tu cuenta ha sido inhabilitada por reiterados bloqueos reportados por varios barberos.',
          };
        }
        const appUser = await this.resolveAndSyncUserRole(
          data.user,
          null,
          'login'
        );
        if (!appUser) {
          const authErr = this.consumeLastAuthError();
          return {
            error:
              authErr?.message ||
              'No se pudo iniciar sesión.',
          };
        }
        this.saveCurrentSession(appUser);
        return { user: appUser };
      }

      return { error: 'No se pudo iniciar sesión.' };
    } catch (err: any) {
      if (err.message === 'TIMEOUT_EXCEEDED' || err.status === 502 || err.message?.includes('Failed to fetch')) {
        return { error: 'El servidor de autenticación está tardando en responder. Por favor reintenta en unos segundos.' };
      }
      return { error: this.translateAuthError(err?.message || 'Error al iniciar sesión') };
    }
  }

  /**
   * Resend signup email confirmation
   */
  public async resendConfirmationEmail(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
      });

      if (error) {
        return { success: false, error: this.translateAuthError(error.message) };
      }
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: this.translateAuthError(err?.message || 'Error al reenviar el correo de confirmación'),
      };
    }
  }

  /**
   * Translate Supabase Auth errors into user-friendly Spanish
   */
  public translateAuthError(rawMessage?: string): string {
    if (!rawMessage) return 'Ha ocurrido un error inesperado. Por favor intenta de nuevo.';
    const msg = rawMessage.toLowerCase();

    if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
      return 'Tu correo electrónico no ha sido confirmado aún. Por favor revisa tu bandeja de entrada o spam para verificar tu cuenta.';
    }
    if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (msg.includes('user already registered') || msg.includes('already registered')) {
      return 'Este correo ya está registrado. Por favor inicia sesión.';
    }
    if (msg.includes('password should be at least 6 characters') || msg.includes('password should be at least')) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }
    if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit')) {
      return 'Has superado el límite de intentos o envíos. Por favor espera unos minutos antes de intentar de nuevo.';
    }
    if (msg.includes('user not found')) {
      return 'No existe una cuenta registrada con este correo electrónico.';
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return 'Error de conexión. Por favor verifica tu red e inténtalo de nuevo.';
    }
    if (msg.includes('signup disabled') || msg.includes('signups not allowed')) {
      return 'El registro de nuevas cuentas está deshabilitado temporalmente.';
    }
    if (msg.includes('email provider is disabled')) {
      return 'El método de autenticación por correo no está habilitado en el servidor.';
    }

    return rawMessage;
  }

  /**
   * Requisito 3: Limpieza Forzada de Caché Local al Cerrar Sesión (Sign Out)
   * a) Ejecuta await supabase.auth.signOut()
   * b) Ejecuta localStorage.clear() y sessionStorage.clear()
   * c) Reinicia inmediatamente el estado global de sesión a null
   */
  public async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Error signing out from Supabase:', err);
    }
    try {
      localStorage.clear();
    } catch {}
    try {
      sessionStorage.clear();
    } catch {}
    this.currentUser = null;
    this.notify();
  }

  public async signOut(): Promise<void> {
    await this.logout();
  }

  /**
   * Helper to manually set session if needed
   */
  public setUser(user: User | null): void {
    this.saveCurrentSession(user);
  }

  public saveCurrentUser(user: User | null): void {
    this.saveCurrentSession(user);
  }

  /**
   * SECURITY ENFORCEMENT:
   * Only the creator/owner (clientId) OR the designated barber can edit, cancel, or reassign an appointment.
   */
  public canModifyAppointment(user: User | null, appointment: Appointment): boolean {
    if (!user) return false;
    if (user.role === 'barber') {
      return user.barberId === appointment.barberId;
    }
    return user.id === appointment.clientId;
  }

  /**
   * PRIVACY ENFORCEMENT:
   * Third-party users cannot view client phone, email, or notes.
   */
  public canViewPrivateDetails(user: User | null, appointment: Appointment): boolean {
    if (!user) return false;
    if (user.role === 'barber') {
      return user.barberId === appointment.barberId;
    }
    return user.id === appointment.clientId;
  }
}

export const authService = new AuthService();
