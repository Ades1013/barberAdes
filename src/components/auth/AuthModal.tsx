import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, Mail, Lock, User, ArrowRight, ArrowLeft, Loader2, Eye, EyeOff, RefreshCw, CheckCircle2, KeyRound } from 'lucide-react';
import { authService } from '../../services/authService';
import { storageService } from '../../services/storageService';
import { supabase } from '../../services/supabaseClient';
import { User as UserType } from '../../types';
import { PhoneInputWithCountry } from '../common/PhoneInputWithCountry';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserType) => void;
  initialRecoveryMode?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialRecoveryMode = false,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [viewMode, setViewMode] = useState<'auth' | 'forgot_password' | 'update_password'>(() =>
    initialRecoveryMode || authService.isPasswordRecovery() ? 'update_password' : 'auth'
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<'client' | 'barber'>('client');

  // Password recovery states
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryEmailSent, setRecoveryEmailSent] = useState<boolean>(false);
  const [recoveryLinkInput, setRecoveryLinkInput] = useState('');
  const [showManualRecoveryInput, setShowManualRecoveryInput] = useState<boolean>(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Password visibility toggle
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Email confirmation pending state
  const [registeredEmailForConfirmation, setRegisteredEmailForConfirmation] = useState<string | null>(null);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [resendNotice, setResendNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleModalClose = () => {
    if (viewMode === 'update_password') {
      authService.setPasswordRecoveryMode(false);
    }
    setError(null);
    setSuccessNotice(null);
    setResendNotice(null);
    setRegisteredEmailForConfirmation(null);
    setShowPassword(false);
    setSelectedRole('client');
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    setRecoveryEmail('');
    setRecoveryEmailSent(false);
    setNewPassword('');
    setConfirmNewPassword('');
    setViewMode('auth');
    onClose();
  };

  // Limpieza total de campos de entrada cada vez que se abre el modal (conservando errores de retorno de OAuth si existen)
  React.useEffect(() => {
    if (isOpen) {
      setEmail('');
      setPassword('');
      setFullName('');
      setPhone('');
      setSuccessNotice(null);
      setResendNotice(null);
      setRegisteredEmailForConfirmation(null);
      setShowPassword(false);
      setRecoveryEmail('');
      setRecoveryEmailSent(false);
      setRecoveryLinkInput('');
      setShowManualRecoveryInput(false);
      setNewPassword('');
      setConfirmNewPassword('');

      const pendingAuthErr = authService.consumeLastAuthError();
      if (pendingAuthErr) {
        setError(pendingAuthErr.message);
        if (pendingAuthErr.switchToLogin) {
          setTab('login');
          setPassword('');
        }
      } else {
        setError(null);
      }

      const hasRecoveryHash =
        typeof window !== 'undefined' &&
        ((window.location.hash && window.location.hash.includes('type=recovery')) ||
          (window.location.search && window.location.search.includes('type=recovery')));
      if (initialRecoveryMode || authService.isPasswordRecovery() || hasRecoveryHash) {
        setViewMode('update_password');
      } else {
        setViewMode('auth');
      }
    }
  }, [isOpen, initialRecoveryMode]);

  // Escuchar alertas de bloqueo de seguridad de OAuth / cambio de sesión en vivo
  React.useEffect(() => {
    const unsubError = authService.subscribeAuthError((errPayload) => {
      if (!errPayload) return;
      setIsLoading(false);
      setError(errPayload.message);
      if (errPayload.switchToLogin) {
        setTab('login');
        setPassword('');
      }
      setViewMode('auth');
    });
    return () => unsubError();
  }, []);

  // Escuchar sesión de recuperación PASSWORD_RECOVERY y hash '#access_token=...&type=recovery' en vivo
  React.useEffect(() => {
    const checkHashForRecovery = async () => {
      if (typeof window === 'undefined') return;
      const hash = window.location.hash || '';
      if (hash.includes('access_token=') && hash.includes('type=recovery')) {
        await authService.processRecoveryLinkOrHash(hash);
        setViewMode('update_password');
        setError(null);
        setSuccessNotice(null);
      }
    };
    checkHashForRecovery();

    const unsubRecovery = authService.subscribeRecovery((isRec) => {
      if (isRec) {
        setViewMode('update_password');
        setError(null);
        setSuccessNotice(null);
      }
    });
    return () => unsubRecovery();
  }, []);

  // Soporte global de tecla Escape (Esc) y bloqueo de scroll del fondo
  React.useEffect(() => {
    if (!isOpen) return;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleModalClose();
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
  }, [isOpen, viewMode]);

  // Sincronización automática de sesión tras autenticación en popup de Google (no cerrar si está en update_password)
  React.useEffect(() => {
    if (!isOpen || viewMode === 'update_password' || authService.isPasswordRecovery()) return;
    const unsubscribe = authService.subscribe((user) => {
      if (user && !authService.isPasswordRecovery()) {
        onSuccess(user);
        handleModalClose();
      }
    });
    return () => unsubscribe();
  }, [isOpen, onSuccess, viewMode]);

  // Punto 2: Detección automática en PC cada 3 segundos cuando el usuario confirma el correo desde su celular
  React.useEffect(() => {
    if (!isOpen || !registeredEmailForConfirmation) return;
    let isCancelled = false;

    const checkConfirmationInterval = setInterval(async () => {
      if (isCancelled) return;
      try {
        // 1. Verificar si ya existe una sesión activa en Supabase
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          const appUser = await authService.resolveAndSyncUserRole(
            sessionData.session.user,
            selectedRole,
            'register'
          );
          await authService.refreshSession();
          if (!isCancelled && appUser) {
            onSuccess(appUser);
            handleModalClose();
          }
          return;
        }

        // 2. Intentar autenticar silenciosamente con el correo y contraseña recién registrados
        if (password && password.length >= 6) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('barbersync_pending_role', selectedRole);
            localStorage.setItem('pending_auth_role', selectedRole);
          }
          const { data, error: signInErr } = await supabase.auth.signInWithPassword({
            email: registeredEmailForConfirmation,
            password: password,
          });
          if (!signInErr && data?.user) {
            const appUser = await authService.resolveAndSyncUserRole(
              data.user,
              selectedRole,
              'register'
            );
            await authService.refreshSession();
            if (!isCancelled && appUser) {
              onSuccess(appUser);
              handleModalClose();
            }
          }
        }
      } catch {
        // Ignorar errores transitorios mientras el usuario aún no confirma en su celular
      }
    }, 3000);

    return () => {
      isCancelled = true;
      clearInterval(checkConfirmationInterval);
    };
  }, [isOpen, registeredEmailForConfirmation, password, selectedRole, onSuccess]);

  if (!isOpen) return null;

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    const targetEmail = (recoveryEmail || email).trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      setError('Por favor ingresa el correo electrónico registrado en tu cuenta.');
      return;
    }

    setIsLoading(true);
    try {
      // Configurar redirectTo limpiando la URL: usar URL pública directa del origen (window.location.origin)
      // removiendo cualquier parámetro de applet-auth-bridge o aistudio.google.com
      const cleanRedirectTo = authService.getCleanRedirectOrigin();
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: cleanRedirectTo,
      });

      if (resetErr) {
        setError(authService.translateAuthError(resetErr.message));
      } else {
        setRecoveryEmail(targetEmail);
        setRecoveryEmailSent(true);
        setSuccessNotice(
          `Hemos enviado un enlace oficial de recuperación a ${targetEmail}. Revisa tu bandeja de entrada o carpeta de spam.`
        );
      }
    } catch (err: any) {
      setError(authService.translateAuthError(err?.message || 'Error al enviar el correo de recuperación.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualRecoveryLinkSubmit = async () => {
    setError(null);
    setSuccessNotice(null);
    if (!recoveryLinkInput.trim()) {
      setError('Pega el enlace o token de recuperación del correo.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await authService.processRecoveryLinkOrHash(recoveryLinkInput);
      if (!res.success) {
        setError(res.error || 'Enlace de recuperación inválido.');
      } else {
        setRecoveryLinkInput('');
        setShowManualRecoveryInput(false);
        setViewMode('update_password');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    if (!newPassword || newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('Las contraseñas no coinciden. Verifica e inténtalo de nuevo.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        setError(authService.translateAuthError(updateErr.message));
        return;
      }

      authService.setPasswordRecoveryMode(false);
      setSuccessNotice('¡Tu contraseña ha sido actualizada con éxito!');

      if (data?.user) {
        const appUser = await authService.resolveAndSyncUserRole(data.user);
        if (appUser) {
          authService.saveCurrentUser(appUser);
          setTimeout(() => {
            onSuccess(appUser);
            handleModalClose();
          }, 1200);
          return;
        }
      }
      setTimeout(() => {
        setViewMode('auth');
        setTab('login');
        setPassword('');
        setSuccessNotice('Contraseña actualizada correctamente. Ya puedes iniciar sesión.');
      }, 1200);
    } catch (err: any) {
      setError(authService.translateAuthError(err?.message || 'Error al actualizar la contraseña.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setSuccessNotice(null);
    setResendNotice(null);
    setIsLoading(true);

    if (tab === 'login') {
      // Requisito 1: Estando en la pestaña "Tengo cuenta", guardar estrictamente auth_intent_action = "login" y eliminar cualquier auth_intent_role
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('auth_intent_action', 'login');
          sessionStorage.removeItem('auth_intent_role');
        } catch {}
      }

      const res = await authService.signInWithGoogle(undefined, 'login');
      setIsLoading(false);
      if (res.error) {
        setError(res.error);
      }
      return;
    }

    // Modo Registro (tab === 'register')
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('auth_intent_role', selectedRole);
        sessionStorage.setItem('auth_intent_action', 'register');
      } catch {}
    }

    // Cerrar cualquier sesión residual previa y limpiar estado local antes de procesar
    try {
      await supabase.auth.signOut();
      await authService.clearResidualSessionBeforeRegister();
    } catch {}

    // Volver a asegurar la intención en sessionStorage tras limpiar sesión residual
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('auth_intent_role', selectedRole);
        sessionStorage.setItem('auth_intent_action', 'register');
      } catch {}
    }

    if (email.trim() && email.includes('@')) {
      try {
        const check = await authService.checkEmailExists(email);
        if (check.exists) {
          setIsLoading(false);
          setPassword('');
          setTab('login');
          setError("Esta cuenta de Google ya está registrada. Por favor inicia sesión desde la pestaña 'Tengo cuenta'");
          return;
        }
      } catch {}
    }

    const res = await authService.signInWithGoogle(selectedRole, 'register');
    setIsLoading(false);
    if (res.error) {
      setError(res.error);
    }
  };

  const handleResendConfirmation = async (targetEmail: string) => {
    if (!targetEmail.trim()) {
      setError('Por favor ingresa un correo para reenviar la confirmación.');
      return;
    }

    setIsResending(true);
    setResendNotice(null);
    const res = await authService.resendConfirmationEmail(targetEmail);
    setIsResending(false);

    if (res.success) {
      setResendNotice({
        type: 'success',
        message: `Correo de confirmación reenviado a ${targetEmail}. Revisa tu bandeja de entrada o spam.`,
      });
    } else {
      setResendNotice({
        type: 'error',
        message: res.error || 'No se pudo reenviar el correo. Intenta de nuevo en unos momentos.',
      });
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);
    setResendNotice(null);

    if (!email.trim() || !password.trim()) {
      setError('Por favor completa el correo electrónico y la contraseña.');
      return;
    }

    if (tab === 'register' && !fullName.trim()) {
      setError('Por favor ingresa tu nombre completo.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsLoading(true);

    if (tab === 'register') {
      const DUPLICATE_EMAIL_MSG =
        "Ya existe una cuenta con este correo electrónico. Por favor, inicia sesión en la pestaña 'Tengo cuenta'";
      try {
        // 1a) Cerrar cualquier sesión residual previa (supabase.auth.signOut()) y limpiar el estado local antes de procesar el formulario
        await supabase.auth.signOut();
        await authService.clearResidualSessionBeforeRegister();

        // 1b) Consultar en la base de datos (public.profiles o public.barbers) si el correo ingresado ya existe
        const check = await authService.checkEmailExists(email);
        if (check.exists) {
          // 1c) Si el correo YA EXISTE: DETENER inmediatamente la ejecución, mostrar alerta roja destacada, cambiar a 'Tengo cuenta' y vaciar contraseña
          setIsLoading(false);
          setPassword('');
          setTab('login');
          setError(DUPLICATE_EMAIL_MSG);
          return;
        }

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 8000)
        );
        const registerPromise = authService.signUpWithEmail(email, password, fullName, phone, selectedRole);
        const res = (await Promise.race([registerPromise, timeoutPromise])) as any;

        if (res?.error) {
          if (res?.emailExists || res?.error?.toLowerCase().includes('ya existe')) {
            await supabase.auth.signOut();
            await authService.clearResidualSessionBeforeRegister();
            setPassword('');
            setTab('login');
            setError(DUPLICATE_EMAIL_MSG);
          } else {
            setError(res.error);
          }
        } else if (res?.needsEmailConfirmation) {
          setRegisteredEmailForConfirmation(email.trim().toLowerCase());
        } else if (res?.user) {
          onSuccess(res.user);
          handleModalClose();
        } else {
          setRegisteredEmailForConfirmation(email.trim().toLowerCase());
        }
      } catch (err: any) {
        console.error('Error durante el registro:', err);
        if (err.message === 'TIMEOUT_EXCEEDED' || err.status === 502 || err.message?.includes('Failed to fetch')) {
          setError('El servidor de autenticación está tardando en responder. Por favor reintenta en unos segundos.');
        } else {
          setError(err.message || 'Error al registrar usuario.');
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      // Requisito 1: En "Tengo cuenta", guardar estrictamente auth_intent_action = "login" y eliminar cualquier auth_intent_role
      try {
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('auth_intent_action', 'login');
            sessionStorage.removeItem('auth_intent_role');
          } catch {}
        }

        if (storageService.isClientGloballySuspended(email.trim())) {
          setIsLoading(false);
          setError('Tu cuenta ha sido suspendida por bloqueos reiterados de múltiples barberías.');
          return;
        }

        const res = await authService.signInWithEmail(email.trim(), password);

        if (res.error) {
          setError(res.error);
          return;
        }

        if (res.user) {
          onSuccess(res.user);
          handleModalClose();
        }
      } catch (err: any) {
        console.error('Error durante la autenticación:', err);

        if (err.message === 'TIMEOUT_EXCEEDED' || err.status === 502 || err.message?.includes('Failed to fetch')) {
          setError('El servidor de autenticación está tardando en responder. Por favor reintenta en unos segundos.');
        } else if (err.message?.includes('Invalid login credentials') || err.message?.includes('invalid_grant')) {
          setError('Correo o contraseña incorrectos.');
        } else if (
          err.message?.toLowerCase().includes('email not confirmed') ||
          err.message?.toLowerCase().includes('not confirmed')
        ) {
          setError('Tu correo aún no ha sido confirmado. Por favor revisa tu bandeja de entrada o spam para verificar tu cuenta.');
        } else {
          setError(err.message || 'Error al conectar con el servidor.');
        }
      } finally {
        // OBLIGATORIO: Apagar el spinner y reactivar el botón siempre
        setIsLoading(false);
      }
    }
  };

  const isEmailUnconfirmedError =
    error &&
    (error.toLowerCase().includes('no ha sido confirmado') ||
      error.toLowerCase().includes('not confirmed') ||
      error.toLowerCase().includes('verificar tu cuenta'));

  const modalContent = (
    <div
      data-modal-open="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-x-hidden"
    >
      <div className="relative w-[92vw] sm:w-full sm:max-w-md bg-[#12151b] border border-amber-500/30 rounded-2xl p-4 sm:p-6 text-slate-100 shadow-2xl max-h-[88dvh] overflow-y-auto overflow-x-hidden min-w-0">
        {/* Close Button */}
        <button
          onClick={handleModalClose}
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ---------------- VISTA RECUPERACIÓN: ESTABLECER NUEVA CONTRASEÑA (PASSWORD_RECOVERY) ---------------- */}
        {viewMode === 'update_password' ? (
          <div className="py-1 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-5">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Establecer Nueva Contraseña
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Ingresa y confirma tu nueva contraseña para actualizar el acceso a tu cuenta de BarberAdes.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-950/80 border-2 border-rose-500/70 text-rose-200 font-semibold text-xs leading-relaxed">
                {error}
              </div>
            )}

            {successNotice && (
              <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs leading-relaxed flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successNotice}</span>
              </div>
            )}

            <form onSubmit={handleUpdatePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nueva Contraseña <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Confirmar Contraseña <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Repite tu nueva contraseña"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Actualizando contraseña...</span>
                  </>
                ) : (
                  <>
                    <span>Establecer Nueva Contraseña</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        ) : viewMode === 'forgot_password' ? (
          /* ---------------- VISTA: ¿OLVIDASTE TU CONTRASEÑA? (SOLICITAR CORREO) ---------------- */
          <div className="py-1 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-5">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
                <Mail className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Recuperar Contraseña
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Ingresa tu correo electrónico registrado y te enviaremos un enlace seguro para restablecer tu contraseña.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-950/80 border-2 border-rose-500/70 text-rose-200 font-semibold text-xs leading-relaxed">
                {error}
              </div>
            )}

            {successNotice && (
              <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs leading-relaxed flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successNotice}</span>
              </div>
            )}

            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Correo electrónico registrado <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="ejemplo@correo.com"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Enviando enlace...</span>
                  </>
                ) : (
                  <>
                    <span>{recoveryEmailSent ? 'Reenviar enlace de recuperación' : 'Enviar correo de recuperación'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Flujo alternativo si el navegador bloqueó el enlace del correo con 403 */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowManualRecoveryInput((prev) => !prev)}
                  className="w-full text-[11px] font-semibold text-amber-400 hover:text-amber-300 underline text-center cursor-pointer"
                >
                  {showManualRecoveryInput
                    ? 'Ocultar ingreso manual de enlace'
                    : '¿Ya abriste el enlace del correo o viste error 403? Haz clic aquí'}
                </button>

                {showManualRecoveryInput && (
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-2">
                    <p className="text-[11px] text-slate-300 leading-snug">
                      Si el enlace del correo abrió una ventana con error 403, copia la dirección completa (con <code className="text-amber-400">#access_token=...&type=recovery</code>) y pégala aquí:
                    </p>
                    <input
                      type="text"
                      placeholder="Pega aquí el enlace o #access_token=...&type=recovery"
                      value={recoveryLinkInput}
                      onChange={(e) => setRecoveryLinkInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleManualRecoveryLinkSubmit}
                      disabled={isLoading}
                      className="w-full py-2 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Validar Enlace y Establecer Nueva Contraseña
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setViewMode('auth');
                  setTab('login');
                  setError(null);
                  setSuccessNotice(null);
                }}
                className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
                <span>Volver a Iniciar Sesión</span>
              </button>
            </form>
          </div>
        ) : registeredEmailForConfirmation ? (
          /* ---------------- STATE 1: PENDING CONFIRMATION SCREEN ---------------- */
          <div className="text-center py-2 animate-in fade-in zoom-in-95 duration-200">
            {/* Mail Icon with animated ring */}
            <div className="relative w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-950/40">
              <Mail className="w-8 h-8" />
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-[10px]">
                ✓
              </div>
            </div>

            <h2 className="text-xl font-bold text-white tracking-tight mb-2">
              ¡Cuenta creada con éxito!
            </h2>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 leading-relaxed mb-4 text-left space-y-2">
              <p>
                Hemos enviado un enlace de confirmación a tu correo{' '}
                <strong className="text-amber-400 font-semibold break-all">
                  {registeredEmailForConfirmation}
                </strong>
                .
              </p>
              <p className="text-slate-400 text-[11px]">
                Por favor revisa tu bandeja de entrada (o carpeta de spam) y haz clic en el enlace desde tu celular o PC. En cuanto lo confirmes, esta pantalla iniciará sesión automáticamente.
              </p>
              <div className="pt-2 mt-2 border-t border-slate-800/80 flex items-center gap-2 text-emerald-400 text-[11px] font-medium">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Esperando confirmación en tiempo real...</span>
              </div>
            </div>

            {resendNotice && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs leading-relaxed ${
                  resendNotice.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                }`}
              >
                {resendNotice.message}
              </div>
            )}

            <div className="space-y-3">
              {/* Primary: Volver a iniciar sesión */}
              <button
                type="button"
                onClick={() => {
                  setEmail(registeredEmailForConfirmation);
                  setPassword('');
                  setRegisteredEmailForConfirmation(null);
                  setTab('login');
                  setError(null);
                  setSuccessNotice(null);
                  setResendNotice(null);
                }}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-lg shadow-amber-950/40 uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Volver a iniciar sesión</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Secondary: Reenviar correo de confirmación */}
              <button
                type="button"
                onClick={() => handleResendConfirmation(registeredEmailForConfirmation)}
                disabled={isResending}
                className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isResending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Reenviando confirmación...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Reenviar correo de confirmación</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ---------------- STATE 2: REGULAR LOGIN / REGISTER ---------------- */
          <>
            {/* Header */}
            <div className="text-center mb-5">
              <div className="w-11 h-11 mx-auto mb-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {tab === 'login' ? 'Iniciar Sesión en BarberAdes' : 'Crear Cuenta en BarberAdes'}
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Accede a tu cuenta segura para gestionar tus citas, reservas y turnos de barbería.
              </p>
            </div>

            {/* Unified Tab Switcher */}
            <div className="flex rounded-xl bg-slate-900/90 p-1 border border-slate-800 mb-5">
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError(null);
                  setSuccessNotice(null);
                  setResendNotice(null);
                  if (typeof window !== 'undefined') {
                    try {
                      sessionStorage.setItem('auth_intent_action', 'login');
                      sessionStorage.removeItem('auth_intent_role');
                    } catch {}
                  }
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  tab === 'login'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tengo cuenta
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setError(null);
                  setSuccessNotice(null);
                  setResendNotice(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  tab === 'register'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Registrarme
              </button>
            </div>

            {/* Error Banner with prominent red alert style and optional Resend Confirmation link */}
            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-950/90 border-2 border-rose-500/80 text-rose-200 font-semibold text-xs leading-relaxed shadow-lg shadow-rose-950/40 space-y-2 animate-in fade-in duration-150">
                <p>{error}</p>
                {isEmailUnconfirmedError && email && (
                  <div className="pt-1 border-t border-rose-500/20">
                    <button
                      type="button"
                      onClick={() => handleResendConfirmation(email)}
                      disabled={isResending}
                      className="text-amber-400 hover:text-amber-300 underline font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 text-[11px]"
                    >
                      {isResending ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                          <span>Reenviando correo de confirmación...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          <span>¿No recibiste el correo? Reenviar confirmación</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Resend Notice (if triggered from error banner) */}
            {resendNotice && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs leading-relaxed ${
                  resendNotice.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                }`}
              >
                {resendNotice.message}
              </div>
            )}

            {successNotice && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs leading-relaxed flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successNotice}</span>
              </div>
            )}

            {/* Requisito 1: Selector de Rol visible ÚNICAMENTE cuando la pestaña activa sea "Registrarme" */}
            {tab === 'register' && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  ¿Cómo deseas registrarte?
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/90 border border-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('client')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      selectedRole === 'client'
                        ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span>👤 Soy Cliente</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole('barber')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      selectedRole === 'barber'
                        ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span>✂️ Soy Barbero</span>
                  </button>
                </div>
              </div>
            )}

            {/* Real Google OAuth Button */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-60"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Continuar con Google</span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-[1px] bg-slate-800" />
                <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                  o con correo electrónico
                </span>
                <div className="flex-1 h-[1px] bg-slate-800" />
              </div>

              {/* Real Email / Password Form */}
              <form onSubmit={handleEmailAuth} className="space-y-3.5 min-w-0 w-full">
                {tab === 'register' && (
                  <>
                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Nombre completo <span className="text-amber-400">*</span>
                      </label>
                      <div className="relative min-w-0">
                        <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          maxLength={20}
                          placeholder="Ej. Carlos Mendoza"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value.slice(0, 20))}
                          className="w-full min-w-0 pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Teléfono / Celular (Opcional)
                      </label>
                      <PhoneInputWithCountry
                        placeholder="Ej. 300 123 4567"
                        value={phone}
                        onChange={(val) => setPhone(val)}
                        className="min-w-0 flex-1"
                      />
                    </div>
                  </>
                )}

                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Correo Electrónico <span className="text-amber-400">*</span>
                  </label>
                  <div className="relative min-w-0">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      autoComplete="off"
                      placeholder="ejemplo@correo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full min-w-0 pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      Contraseña <span className="text-amber-400">*</span>
                    </label>
                  </div>
                  <div className="relative min-w-0">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full min-w-0 pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                    {/* Toggle password visibility button */}
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-amber-400 transition-colors focus:outline-none cursor-pointer"
                      title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Requisito 2: Enlace interactivo "¿Olvidaste tu contraseña?" en la pestaña "Tengo cuenta" */}
                  {tab === 'login' && (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setRecoveryEmail(email);
                          setRecoveryEmailSent(false);
                          setError(null);
                          setSuccessNotice(null);
                          setViewMode('forgot_password');
                        }}
                        className="text-xs font-semibold text-amber-400 hover:text-amber-300 hover:underline transition-colors cursor-pointer"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full mt-2 py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-950/40 ${
                    isLoading
                      ? 'bg-amber-600/70 text-slate-900 cursor-not-allowed opacity-75'
                      : 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 cursor-pointer hover:shadow-amber-500/20 active:scale-[0.99]'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      <span>{tab === 'login' ? 'Iniciando sesión...' : 'Registrando...'}</span>
                    </>
                  ) : (
                    <>
                      <span>{tab === 'login' ? 'Iniciar Sesión' : 'Registrarse'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

