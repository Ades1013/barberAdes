import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Mail, Phone, ShieldCheck, Lock, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { User as UserType } from '../../types';
import { PhoneInputWithCountry, validatePhoneDigits } from '../common/PhoneInputWithCountry';
import { supabase } from '../../services/supabaseClient';
import { authService } from '../../services/authService';
import { storageService } from '../../services/storageService';

interface ClientDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType | null;
  onUserDataUpdated?: (updatedUser: UserType) => void;
}

export const ClientDataModal: React.FC<ClientDataModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserDataUpdated,
}) => {
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('+57');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      const rawPhone =
        currentUser.phone ||
        (currentUser as any)?.user_metadata?.phone ||
        (currentUser as any)?.user_metadata?.phoneNumber ||
        '';
      if (rawPhone && rawPhone.trim() && rawPhone.trim() !== '+57') {
        setPhone(rawPhone.startsWith('+') ? rawPhone : `+57${rawPhone}`);
      } else {
        const lastClient = storageService.getLastClient();
        if (lastClient?.phone) {
          setPhone(lastClient.phone.startsWith('+') ? lastClient.phone : `+57${lastClient.phone}`);
        } else {
          setPhone('+57');
        }
      }
    }
  }, [currentUser, isOpen]);

  useEffect(() => {
    if (!isOpen || !currentUser) return;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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
  }, [isOpen, currentUser, onClose]);

  if (!isOpen || !currentUser) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Por favor ingresa tu nombre completo.');
      return;
    }

    let finalPhone = phone.trim();
    if (finalPhone && finalPhone !== '+57') {
      const phoneCheck = validatePhoneDigits(finalPhone);
      if (!phoneCheck.isValid) {
        setErrorMsg(phoneCheck.message || 'El número de WhatsApp/celular no es válido.');
        return;
      }
    } else {
      finalPhone = '';
    }

    setIsSaving(true);

    try {
      // 1. Actualizar usuario en authService / LocalStorage
      const updatedUser: UserType = {
        ...currentUser,
        name: trimmedName,
        phone: finalPhone || '',
      };

      authService.saveCurrentUser(updatedUser);

      // Guardar en lastClient para formularios
      storageService.saveLastClient({
        name: trimmedName,
        phone: finalPhone || '',
        email: currentUser.email,
      });

      // 2. Sincronizar en Supabase profiles si es posible
      try {
        if (currentUser.id) {
          const { error: upErr } = await supabase.from('profiles').upsert({
            id: currentUser.id,
            user_id: currentUser.id,
            email: currentUser.email,
            role: 'client',
            name: trimmedName,
          });
          if (upErr) {
            await supabase.from('profiles').upsert({
              id: currentUser.id,
              email: currentUser.email,
              role: 'client',
              name: trimmedName,
            });
          }
        }

        // Actualizar user_metadata en auth de Supabase
        await supabase.auth.updateUser({
          data: {
            name: trimmedName,
            full_name: trimmedName,
            phone: finalPhone || null,
          },
        });
      } catch (cloudErr) {
        console.warn('Aviso al actualizar perfil en la nube (datos guardados localmente):', cloudErr);
      }

      setSuccessMsg('¡Tus datos han sido actualizados exitosamente!');
      if (onUserDataUpdated) {
        onUserDataUpdated(updatedUser);
      }

      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al guardar los datos. Inténtalo de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div
      data-modal-open="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-[#0b0f17] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl text-slate-100 flex flex-col max-h-[88dvh]">
        {/* Header integrado */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Mis Datos Personales</span>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  {currentUser.role === 'barber' ? 'Barbero BarberAdes' : 'Cliente BarberAdes'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Consulta y actualiza tu información de contacto para tus reservas.
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

        {/* Formulario */}
        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
          {/* Email bloqueado y verificado */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-400" />
                <span>Correo Electrónico Verificado</span>
                <span className="text-amber-400">*</span>
              </label>
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium text-[10px] border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                <ShieldCheck className="w-3 h-3" />
                <span>Bloqueado e Inmutable</span>
              </span>
            </div>
            <div className="relative">
              <input
                type="email"
                value={currentUser.email || ''}
                readOnly
                disabled
                className="w-full px-3.5 py-2.5 bg-slate-900/60 border border-slate-700/60 rounded-xl text-sm text-slate-400 font-mono cursor-not-allowed select-none"
              />
              <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Tu correo es la llave única de tu cuenta y no puede modificarse por seguridad.
            </p>
          </div>

          {/* Nombre Completo */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nombre Completo <span className="text-amber-400">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 20))}
                placeholder="Ej. Juan Jaramillo"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* WhatsApp / Celular */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              WhatsApp / Celular (Opcional)
            </label>
            <PhoneInputWithCountry
              value={phone}
              onChange={(val) => setPhone(val)}
              placeholder="Ej. 300 123 4567"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Número al cual el barbero podrá enviarte la confirmación del turno si lo deseas.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-amber-950/30 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
