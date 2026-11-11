import React from 'react';
import { Barber, Service } from '../../types';
import { Sparkles, ShieldCheck, CheckCircle2, Calendar, Clock, Scissors, MessageCircle, Download, LogIn, ArrowRight, UserCheck, Check, Star } from 'lucide-react';
import { formatCurrency } from '../../utils/dateUtils';

interface ClientPublicLandingProps {
  onOpenAuthModal: () => void;
  barbers?: Barber[];
  services?: Service[];
}

export const ClientPublicLanding: React.FC<ClientPublicLandingProps> = ({
  onOpenAuthModal,
  barbers = [],
  services = [],
}) => {
  return (
    <div className="space-y-12 max-w-5xl mx-auto">
      {/* 1. Encabezado de Bienvenida y Hero Section (Barberos) */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#141822] via-[#0f121a] to-[#0c0e12] border border-amber-500/30 p-6 sm:p-10 lg:p-12 text-center shadow-2xl shadow-amber-950/30">
        <div className="absolute top-0 right-1/2 translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto space-y-5">
          {/* Badge superior oficial */}
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-amber-500/40 text-amber-300 text-xs sm:text-sm font-semibold shadow-inner tracking-wide">
              <span>💈</span>
              <span>La mejor plataforma de gestión y agendamiento para Barberos</span>
            </div>
          </div>

          {/* Título principal de alto impacto */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight sm:leading-none">
            Tu Barbería en Automático.{' '}
            <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 bg-clip-text text-transparent block mt-1">
              Más Citas, Cero Enredos.
            </span>
          </h1>

          {/* Subtítulo neutral e internacional */}
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto font-normal">
            Sincroniza tus turnos en tiempo real, comparte tu catálogo público y recibe reservas directas sin llamadas ni esperas.
          </p>

          {/* Botón principal CTA con estilo destacado, sombra y borde sutil */}
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-xl text-base sm:text-lg font-black bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-xl shadow-amber-500/30 border border-amber-300/40 transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] cursor-pointer"
            >
              <LogIn className="w-5 h-5 text-slate-950" />
              <span>Iniciar Sesión o Registrarse para Agendar</span>
              <ArrowRight className="w-5 h-5 text-slate-950 hidden sm:inline" />
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Acceso seguro con Google o Correo Electrónico · Tus citas quedan protegidas en tu cuenta
          </p>
        </div>
      </section>

      {/* 1.2 Tarjeta Gemela Exclusiva para Clientes (Estructura Simétrica) */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#141822] via-[#0f121a] to-[#0c0e12] border border-amber-500/30 p-6 sm:p-10 lg:p-12 text-center shadow-2xl shadow-amber-950/30">
        <div className="absolute top-0 right-1/2 translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto space-y-5">
          {/* Badge superior exclusivo para clientes */}
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-amber-500/40 text-amber-300 text-xs sm:text-sm font-semibold shadow-inner tracking-wide">
              <span>✂️</span>
              <span>Experiencia de Reserva Rápida y Exclusiva para Clientes</span>
            </div>
          </div>

          {/* Título principal de alto impacto simétrico */}
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight sm:leading-none">
            Tu Estilo a Tiempo.{' '}
            <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 bg-clip-text text-transparent block mt-1">
              Sin Filas, Cero Esperas.
            </span>
          </h2>

          {/* Subtítulo exclusivo para clientes */}
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto font-normal">
            Explora el catálogo oficial de tu barbero favorito, consulta sus horarios libres en vivo y asegura tu silla en segundos desde cualquier dispositivo.
          </p>

          {/* Nota inferior sutil (sin botón) */}
          <div className="pt-2">
            <p className="text-xs sm:text-sm text-amber-400/90 font-medium tracking-wide">
              Confirmación inmediata en pantalla · Recordatorio directo por WhatsApp
            </p>
          </div>
        </div>
      </section>

      {/* 2. Guía paso a paso (3 tarjetas visuales) */}
      <section className="space-y-6">
        <div className="flex justify-center">
          <div className="text-center space-y-1 bg-[#0f172a] border border-slate-700/60 px-6 py-3.5 rounded-2xl shadow-md max-w-xl">
            <h2 className="text-lg sm:text-2xl font-extrabold text-amber-400 tracking-tight">
              Reserva tu sillón en 3 sencillos pasos
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Una experiencia diseñada para que obtengas tu horario exacto en menos de un minuto.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Tarjeta 1 */}
          <div className="relative bg-slate-900/95 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-6 transition-all hover:bg-slate-900 flex flex-col justify-between group shadow-xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                  <UserCheck className="w-6 h-6" />
                </div>
                <span className="font-mono text-2xl font-black text-slate-600 group-hover:text-amber-500/50 transition-colors">
                  01
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  1. Inicia sesión con Google o Correo
                </h3>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  Autenticación rápida y oficial. Protege tus turnos para que nadie más pueda modificarlos ni cancelarlos sin tu consentimiento.
                </p>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-800 flex items-center gap-2 text-[11px] text-amber-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Garantía de aislamiento de citas</span>
            </div>
          </div>

          {/* Tarjeta 2 */}
          <div className="relative bg-slate-900/95 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-6 transition-all hover:bg-slate-900 flex flex-col justify-between group shadow-xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                  <Scissors className="w-6 h-6 -rotate-45" />
                </div>
                <span className="font-mono text-2xl font-black text-slate-600 group-hover:text-amber-500/50 transition-colors">
                  02
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  2. Selecciona barbero y servicio
                </h3>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  Elige a tu profesional de confianza y el corte, barba o combo deseado con precios claros y tiempo estimado de atención.
                </p>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-800 flex items-center gap-2 text-[11px] text-amber-400 font-medium">
              <Star className="w-3.5 h-3.5" />
              <span>Barberos profesionales calificados</span>
            </div>
          </div>

          {/* Tarjeta 3 */}
          <div className="relative bg-slate-900/95 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-6 transition-all hover:bg-slate-900 flex flex-col justify-between group shadow-xl">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                  <Clock className="w-6 h-6" />
                </div>
                <span className="font-mono text-2xl font-black text-slate-600 group-hover:text-amber-500/50 transition-colors">
                  03
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  3. Elige fecha y hora garantizada
                </h3>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  Consulta la disponibilidad real del día y reserva con un solo clic. Tu horario queda reservado instantáneamente en el sistema.
                </p>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-800 flex items-center gap-2 text-[11px] text-amber-400 font-medium">
              <Check className="w-3.5 h-3.5" />
              <span>Cupo reservado en tiempo real</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Vista previa ilustrativa (Mockup no interactivo) */}
      <section className="space-y-4">
        <div className="flex flex-col items-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0f172a] border border-slate-700/60 text-[11px] font-semibold text-amber-400 shadow-md">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>VISTA PREVIA DE CONFIRMACIÓN</span>
          </div>
          <div className="text-center space-y-1 bg-[#0f172a] border border-slate-700/60 px-6 py-3.5 rounded-2xl shadow-md max-w-xl">
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Así luce tu comprobante de reserva
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Al agendar tu turno, recibirás inmediatamente este comprobante con enlace a WhatsApp y sincronización con tu calendario.
            </p>
          </div>
        </div>

        {/* Mockup Card */}
        <div className="max-w-xl mx-auto bg-gradient-to-br from-[#121622] via-[#0f121a] to-[#141824] border border-amber-500/40 rounded-2xl p-6 sm:p-7 shadow-2xl shadow-amber-950/20 relative overflow-hidden select-none">
          {/* Watermark Banner */}
          <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider">
            Ejemplo de Comprobante
          </div>

          {/* Success Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 mx-auto mb-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight">¡Turno Reservado con Éxito!</h3>
            <p className="text-xs text-slate-400 mt-0.5">Tu espacio ha quedado confirmado en la agenda</p>
            <div className="inline-block mt-2 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 font-mono text-sm font-bold text-amber-400 tracking-wider">
              #CO - 002295
            </div>
          </div>

          {/* Appointment Details Card */}
          <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800/80 space-y-3 mb-5">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Scissors className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-white">Corte Clásico + Barba Signature</span>
              </div>
              <span className="text-slate-400">30 minutos</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                  M
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 block leading-none">Barbero</span>
                  <strong className="text-white truncate block">Mateo Silva</strong>
                  <span className="text-[11px] text-amber-400 font-medium">Fade King</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-300">
                <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block leading-none">Fecha</span>
                  <strong className="text-white">13 Oct · 10:30 am</strong>
                  <span className="text-[10px] text-slate-500 block font-mono">2026-10-13</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Valor:</span>
                <strong className="text-amber-400 font-mono text-sm">$ 40.000 COP</strong>
              </div>
              <span className="text-[11px] text-emerald-400 font-medium">Cuenta Verificada</span>
            </div>
          </div>

          {/* Simulated Action Buttons (Mockup) */}
          <div className="space-y-2 pointer-events-none opacity-90">
            <div className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-emerald-600 text-white flex items-center justify-center gap-2 shadow-md">
              <MessageCircle className="w-4 h-4" />
              <span>Recibir Confirmación por WhatsApp (Simulado)</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="py-2 px-3 rounded-lg text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Guardar en Calendario</span>
              </div>
              <div className="py-2 px-3 rounded-lg text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Ver Mi Próxima Cita</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Llamado Final a la Acción */}
      <section className="bg-[#0B0F17] border border-slate-800 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-xl">
        <h3 className="text-xl font-bold text-white tracking-tight">
          ¿Listo para estrenar tu nuevo estilo?
        </h3>
        <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
          Inicia sesión en un clic para desbloquear los horarios disponibles de hoy y asegurar tu cita al instante.
        </p>
        <button
          type="button"
          onClick={onOpenAuthModal}
          className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl text-sm sm:text-base font-extrabold bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 transition-all shadow-lg shadow-amber-500/30 border border-amber-300/40 cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>Iniciar Sesión o Registrarse para Agendar</span>
        </button>
      </section>
    </div>
  );
};
