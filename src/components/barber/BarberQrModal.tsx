import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, QrCode, Download, Copy, Check, ExternalLink, Share2, Sparkles } from 'lucide-react';
import QRCode from 'qrcode';
import { Barber } from '../../types';

interface BarberQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  barber: Barber;
}

export const BarberQrModal: React.FC<BarberQrModalProps> = ({
  isOpen,
  onClose,
  barber,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(true);

  const barberIdentifier = barber?.id || barber?.userId || '';
  const bookingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?barber=${barber?.id || barberIdentifier}`
    : '';

  const barbershopTitle = barber?.barbershopName || barber?.name || 'BarberAdes Studio';
  const barberName = barber?.name || 'Barbero Profesional';

  useEffect(() => {
    if (!isOpen || !bookingUrl) return;

    setIsGenerating(true);
    QRCode.toDataURL(bookingUrl, {
      width: 480,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        setQrDataUrl(url);
        setIsGenerating(false);
      })
      .catch((err) => {
        console.error('Error generando QR code:', err);
        setIsGenerating(false);
      });
  }, [isOpen, bookingUrl]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const cleanName = (barberName || 'Barbero').replace(/[^a-zA-Z0-9]/g, '_');
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR_Reserva_${cleanName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShareWhatsApp = () => {
    const text = `¡Hola! Puedes reservar tu turno directamente en *${barbershopTitle}* desde este enlace oficial: ${bookingUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const modalContent = (
    <div
      data-modal-open="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-sm bg-[#0d131f] border border-amber-500/40 rounded-3xl p-6 text-slate-100 shadow-2xl max-h-[88dvh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Encabezado */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3 shadow-lg shadow-amber-950/20">
            <QrCode className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black text-white tracking-tight">Mi Código QR de Reservas</h3>
          <p className="text-xs text-slate-400 mt-1">
            Tus clientes pueden escanearlo en el local o en tus redes para agendar directamente contigo.
          </p>
        </div>

        {/* Tarjeta del Código QR lista para imprimir o compartir */}
        <div className="bg-white rounded-2xl p-5 shadow-2xl flex flex-col items-center justify-center border-4 border-slate-900/40 relative">
          <div className="text-center mb-2">
            <span className="text-[10px] font-extrabold tracking-widest text-slate-500 uppercase block">
              {barbershopTitle}
            </span>
            <span className="text-sm font-black text-slate-900 block truncate max-w-[220px]">
              {barberName}
            </span>
          </div>

          <div className="w-56 h-56 flex items-center justify-center bg-slate-50 rounded-xl overflow-hidden shadow-inner">
            {isGenerating ? (
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Código QR de Reserva"
                className="w-full h-full object-contain"
              />
            ) : (
              <p className="text-xs text-slate-500">Error al generar QR</p>
            )}
          </div>

          <div className="mt-3 text-center">
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md flex items-center gap-1 justify-center">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Escanea para Agendar</span>
            </span>
          </div>
        </div>

        {/* Enlace de reserva con botón copiar */}
        <div className="mt-4 p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-400 truncate font-mono text-[11px] select-all">
            {bookingUrl}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-all shrink-0 cursor-pointer ${
              isCopied
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            {isCopied ? (
              <>
                <Check className="w-3 h-3" />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copiar</span>
              </>
            )}
          </button>
        </div>

        {/* Botones de acción principales */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!qrDataUrl || isGenerating}
            className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Descargar QR</span>
          </button>

          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Compartir</span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
