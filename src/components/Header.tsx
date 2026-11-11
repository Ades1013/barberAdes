import React from 'react';
import { Scissors, Volume2, VolumeX, Briefcase, Store, Calendar, LogIn, LogOut, Sun, Moon, UserCheck } from 'lucide-react';
import { Role, User as UserType } from '../types';

interface HeaderProps {
  currentRole: Role;
  onSelectRole: (role: Role) => void;
  splitView: boolean;
  onToggleSplitView: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  currentUser: UserType | null;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  onOpenMyBookings?: () => void;
  myActiveAppointmentsCount?: number;
  onOpenBusinessProfile?: () => void;
  onOpenPublicProfilePreview?: () => void;
  onOpenClientProfile?: () => void;
  onOpenClientData?: () => void;
  isAnyModalOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onSelectRole,
  splitView,
  onToggleSplitView,
  soundEnabled,
  onToggleSound,
  theme = 'dark',
  onToggleTheme,
  currentUser,
  onOpenAuthModal,
  onLogout,
  onOpenBusinessProfile,
  onOpenMyBookings,
  onOpenPublicProfilePreview,
  onOpenClientProfile,
  onOpenClientData,
  isAnyModalOpen,
}) => {
  if (isAnyModalOpen) {
    return null;
  }

  const loginMethod = currentUser?.authProvider
    ? currentUser.authProvider.toLowerCase() === 'google'
      ? 'Google'
      : currentUser.authProvider.toLowerCase() === 'email'
      ? 'Email'
      : currentUser.authProvider.charAt(0).toUpperCase() + currentUser.authProvider.slice(1)
    : currentUser?.email?.toLowerCase().includes('@gmail')
    ? 'Google'
    : 'Email';

  const initial = (currentUser?.name || 'U').trim()[0]?.toUpperCase() || 'U';

  const isDarkMode = theme !== 'light';

  const isUserBarber = Boolean(
    currentUser && (
      currentUser.role === 'barber' ||
      (currentUser as any).user_metadata?.role === 'barber' ||
      Boolean(currentUser.barberId)
    )
  );

  return (
    <header className={`sticky top-0 z-30 ${isAnyModalOpen ? 'hidden' : ''} ${isDarkMode ? 'bg-[#0c0e12]/95 border-slate-800/80' : 'bg-white/95 border-slate-200'} backdrop-blur-md border-b w-full max-w-full transition-colors`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
        {/* DESKTOP LAYOUT (md:flex) - Single unified row */}
        <div className="hidden md:flex items-center justify-between h-16 gap-4 w-full">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-950/40">
              <Scissors
                className={`w-5 h-5 -rotate-45 transition-colors ${isDarkMode ? 'text-black' : 'text-white'}`}
                style={{ color: isDarkMode ? '#000000' : '#FFFFFF', stroke: isDarkMode ? '#000000' : '#FFFFFF' }}
              />
            </div>
            <span className="text-lg tracking-tight font-['Plus_Jakarta_Sans',sans-serif] brand-wordmark-title">
              <span className="text-white font-bold">Barber</span><span className="text-amber-500 font-extrabold">Ades</span>
            </span>
          </div>

          {/* Zone 2: Navigation & Controls Group */}
          <div className="flex items-center gap-3 shrink-0">
            {currentUser ? (
              <>
                {isUserBarber ? (
                  <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1 shrink-0">
                    <button
                      onClick={() => {
                        if (splitView) onToggleSplitView();
                        onSelectRole('barber');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                        !splitView && currentRole === 'barber'
                          ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <Briefcase className="w-3.5 h-3.5" />
                      <span>Agenda</span>
                    </button>

                    <button
                      onClick={() => onOpenBusinessProfile?.()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-all whitespace-nowrap cursor-pointer"
                      title="Configurar mis datos profesionales y catálogo de servicios"
                    >
                      <Store className="w-3.5 h-3.5 text-amber-400" />
                      <span>Mis Datos</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1 shrink-0">
                    <button
                      onClick={() => {
                        if (splitView) onToggleSplitView();
                        onSelectRole('client');
                        const el = document.getElementById('step-barber');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm transition-all whitespace-nowrap cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Reservar Cita</span>
                    </button>

                    <button
                      onClick={() => onOpenClientData?.()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-all whitespace-nowrap cursor-pointer"
                      title="Consultar o editar mis datos personales"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>Mis Datos</span>
                    </button>
                  </div>
                )}

                {/* Theme Switcher Button */}
                {onToggleTheme && (
                  <button
                    onClick={onToggleTheme}
                    className={`p-2 rounded-lg text-xs font-medium border transition-colors shrink-0 cursor-pointer ${
                      theme === 'light'
                        ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                        : 'border-slate-800 bg-slate-900/60 text-amber-400 hover:text-amber-300'
                    }`}
                    title={theme === 'dark' ? 'Cambiar a Modo Claro (Azul Barbero)' : 'Cambiar a Modo Oscuro'}
                    aria-label="Alternar tema claro/oscuro"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-700" />}
                  </button>
                )}

                {/* Sound Toggle */}
                <button
                  onClick={onToggleSound}
                  className={`p-2 rounded-lg text-xs font-medium border transition-colors shrink-0 cursor-pointer ${
                    soundEnabled
                      ? 'border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white'
                      : 'border-slate-800 bg-slate-900/30 text-slate-500 hover:text-slate-400'
                  }`}
                  title={soundEnabled ? 'Sonido de aviso activado' : 'Sonido silenciado'}
                  aria-label="Alternar sonido"
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>

                {/* User Account Pill */}
                <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/70 shadow-sm shrink-0">
                  <button
                    onClick={() => {
                      if (isUserBarber) {
                        if (onOpenPublicProfilePreview) {
                          onOpenPublicProfilePreview();
                        } else {
                          onSelectRole('barber');
                        }
                      } else {
                        if (onOpenClientData) {
                          onOpenClientData();
                        } else if (onOpenClientProfile) {
                          onOpenClientProfile();
                        } else {
                          onOpenMyBookings?.();
                        }
                      }
                    }}
                    className="flex items-center gap-2 text-left cursor-pointer hover:opacity-90 transition-opacity"
                    title={isUserBarber ? 'Ver Ficha Pública de mi Barbería' : 'Consultar y editar mis datos'}
                  >
                    <div
                      className={`w-8 h-8 rounded-full bg-gradient-to-br ${
                        currentUser.avatarColor || 'from-amber-600 to-amber-800'
                      } text-white font-black text-xs flex items-center justify-center shrink-0 shadow-sm`}
                    >
                      {initial}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate max-w-[125px] leading-tight">
                        {currentUser.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium leading-tight mt-0.5">
                        <span>{loginMethod}</span>
                        <span className="text-slate-600">·</span>
                        <span
                          className={`px-1.5 py-0.2 text-[9px] font-bold rounded-md shrink-0 select-none ${
                            isUserBarber
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {isUserBarber ? 'Barbero' : 'Cliente'}
                        </span>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={onLogout}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors shrink-0 cursor-pointer border-l border-slate-800 pl-2 ml-0.5"
                    title="Cerrar sesión"
                    aria-label="Cerrar sesión"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                {onToggleTheme && (
                  <button
                    onClick={onToggleTheme}
                    className={`p-2 rounded-lg text-xs font-medium border transition-colors shrink-0 cursor-pointer ${
                      theme === 'light'
                        ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                        : 'border-slate-800 bg-slate-900/60 text-amber-400 hover:text-amber-300'
                    }`}
                    title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
                    aria-label="Alternar tema"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-700" />}
                  </button>
                )}
                <button
                  onClick={onOpenAuthModal}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-md shadow-amber-950/20 shrink-0 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Ingresar / Registrarse</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* MOBILE LAYOUT (md:hidden) - Two distinct levels so nothing gets cut off */}
        <div className="md:hidden py-2 space-y-2 w-full">
          {/* Level 1: Brand & User Controls (100% visible, perfectly aligned) */}
          <div className="flex items-center justify-between gap-2 w-full">
            {/* Wordmark */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md shadow-amber-950/40">
                <Scissors
                  className={`w-3.5 h-3.5 -rotate-45 transition-colors ${isDarkMode ? 'text-black' : 'text-white'}`}
                  style={{ color: isDarkMode ? '#000000' : '#FFFFFF', stroke: isDarkMode ? '#000000' : '#FFFFFF' }}
                />
              </div>
              <span className="text-base tracking-tight font-['Plus_Jakarta_Sans',sans-serif] brand-wordmark-title">
                <span className="text-white font-bold">Barber</span><span className="text-amber-500 font-extrabold">Ades</span>
              </span>
            </div>

            {/* Right Group: Theme Switch + Sound + User Profile Pill / Login */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Theme Switcher Button */}
              {onToggleTheme && (
                <button
                  onClick={onToggleTheme}
                  className={`p-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 cursor-pointer ${
                    theme === 'light'
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-slate-800 bg-slate-900/60 text-amber-400'
                  }`}
                  title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
                  aria-label="Alternar tema"
                >
                  {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>
              )}

              {/* Sound Toggle */}
              <button
                onClick={onToggleSound}
                className={`p-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 cursor-pointer ${
                  soundEnabled
                    ? 'border-slate-800 bg-slate-900/60 text-slate-300'
                    : 'border-slate-800 bg-slate-900/30 text-slate-500'
                }`}
                title={soundEnabled ? 'Sonido activado' : 'Sonido silenciado'}
                aria-label="Alternar sonido"
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* User Profile Pill or Login Button */}
              {currentUser ? (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-900/90 border border-slate-700/70 shadow-sm shrink-0 max-w-[155px]">
                  <button
                    onClick={() => {
                      if (isUserBarber) {
                        if (onOpenPublicProfilePreview) {
                          onOpenPublicProfilePreview();
                        } else {
                          onSelectRole('barber');
                        }
                      } else {
                        if (onOpenClientData) {
                          onOpenClientData();
                        } else if (onOpenClientProfile) {
                          onOpenClientProfile();
                        } else {
                          onOpenMyBookings?.();
                        }
                      }
                    }}
                    className="flex items-center gap-1.5 text-left cursor-pointer min-w-0"
                    title={isUserBarber ? 'Ver Ficha de mi Barbería' : 'Consultar y editar mis datos'}
                  >
                    <div
                      className={`w-6 h-6 rounded-full bg-gradient-to-br ${
                        currentUser.avatarColor || 'from-amber-600 to-amber-800'
                      } text-white font-black text-[10px] flex items-center justify-center shrink-0 shadow-sm`}
                    >
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold text-white max-w-[80px] leading-tight">
                        {currentUser.name}
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-slate-400 font-medium leading-tight mt-0.5">
                        <span className="truncate max-w-[45px]">{loginMethod}</span>
                        <span className="text-slate-600">·</span>
                        <span
                          className={`px-1 py-0.2 text-[8px] font-bold rounded shrink-0 select-none ${
                            isUserBarber
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {isUserBarber ? 'Barbero' : 'Cliente'}
                        </span>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={onLogout}
                    className="p-1 rounded text-slate-400 hover:text-rose-400 transition-colors shrink-0 cursor-pointer border-l border-slate-800 pl-1.5"
                    title="Cerrar sesión"
                    aria-label="Cerrar sesión"
                  >
                    <LogOut className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={onOpenAuthModal}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-sm shrink-0 cursor-pointer"
                >
                  <LogIn className="w-3 h-3 stroke-[2.5]" />
                  <span>Ingresar</span>
                </button>
              )}
            </div>
          </div>

          {/* Level 2: Navigation Action Tabs on Mobile (full width, comfortable touch targets) */}
          {currentUser && (
            <div className="pt-1 border-t border-slate-800/40 w-full">
              {isUserBarber ? (
                <div className="grid grid-cols-2 gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1 w-full">
                  <button
                    onClick={() => {
                      if (splitView) onToggleSplitView();
                      onSelectRole('barber');
                    }}
                    className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      !splitView && currentRole === 'barber'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>Agenda</span>
                  </button>

                  <button
                    onClick={() => onOpenBusinessProfile?.()}
                    className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <Store className="w-3.5 h-3.5 text-amber-400" />
                    <span>Mis Datos</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1 w-full">
                  <button
                    onClick={() => {
                      if (splitView) onToggleSplitView();
                      onSelectRole('client');
                      const el = document.getElementById('step-barber');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm transition-all cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Reservar Cita</span>
                  </button>

                  <button
                    onClick={() => onOpenClientData?.()}
                    className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Mis Datos</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

