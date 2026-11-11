import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Phone } from 'lucide-react';

export interface CountryOption {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  placeholder: string;
}

export const COUNTRY_MAX_DIGITS: Record<string, number> = {
  CO: 10, // Colombia
  MX: 10, // México
  US: 10, // Estados Unidos
  CA: 10, // Canadá
  ES: 9,  // España
  AR: 10, // Argentina
  CL: 9,  // Chile
  PE: 9,  // Perú
  EC: 9,  // Ecuador
  VE: 10, // Venezuela
  BR: 11, // Brasil
};

export function getMaxDigitsForCountry(countryCode?: string): number {
  if (!countryCode) return 10;
  return COUNTRY_MAX_DIGITS[countryCode.toUpperCase()] || 10;
}

export function validatePhoneDigits(phone?: string): { isValid: boolean; expected: number; received: number; countryCode: string; message?: string } {
  if (!phone || !phone.trim() || phone === 'Presencial') {
    return { isValid: true, expected: 10, received: 0, countryCode: 'CO' };
  }
  const clean = phone.trim();
  const matchedCountry = COUNTRIES.find((c) => clean.startsWith(c.dialCode)) || COUNTRIES[0];
  const expected = getMaxDigitsForCountry(matchedCountry.code);
  const localDigits = clean.startsWith(matchedCountry.dialCode)
    ? clean.slice(matchedCountry.dialCode.length).replace(/\D/g, '')
    : clean.replace(/\D/g, '');

  const isValid = localDigits.length === expected;
  return {
    isValid,
    expected,
    received: localDigits.length,
    countryCode: matchedCountry.code,
    message: isValid
      ? undefined
      : `El teléfono para ${matchedCountry.name} debe tener exactamente ${expected} dígitos (ingresaste ${localDigits.length}).`,
  };
}

export const COUNTRIES: CountryOption[] = [
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴', placeholder: '300 123 4567' },
  { code: 'MX', name: 'México', dialCode: '+52', flag: '🇲🇽', placeholder: '55 1234 5678' },
  { code: 'US', name: 'Estados Unidos', dialCode: '+1', flag: '🇺🇸', placeholder: '202 555 0123' },
  { code: 'CA', name: 'Canadá', dialCode: '+1', flag: '🇨🇦', placeholder: '416 555 0123' },
  { code: 'ES', name: 'España', dialCode: '+34', flag: '🇪🇸', placeholder: '612 345 678' },
  { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷', placeholder: '11 2345 6789' },
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱', placeholder: '9 1234 5678' },
  { code: 'PE', name: 'Perú', dialCode: '+51', flag: '🇵🇪', placeholder: '912 345 678' },
  { code: 'EC', name: 'Ecuador', dialCode: '+593', flag: '🇪🇨', placeholder: '99 123 4567' },
  { code: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪', placeholder: '412 123 4567' },
  { code: 'BR', name: 'Brasil', dialCode: '+55', flag: '🇧🇷', placeholder: '11 91234 5678' },
  { code: 'PA', name: 'Panamá', dialCode: '+507', flag: '🇵🇦', placeholder: '6123 4567' },
];

export interface PhoneInputWithCountryProps {
  value: string; // E.g. "+573001234567" or "3001234567" or empty
  onChange: (fullPhoneNumber: string, isValid?: boolean) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
  name?: string;
}

export const PhoneInputWithCountry: React.FC<PhoneInputWithCountryProps> = ({
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  placeholder = 'Ej. 300 123 4567',
  id,
  name,
}) => {
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(COUNTRIES[0]); // Colombia by default
  const [localNumber, setLocalNumber] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync internal state when external value changes
  useEffect(() => {
    if (!value) {
      setLocalNumber('');
      return;
    }

    const cleanVal = value.trim();
    if (cleanVal.startsWith('+')) {
      const matched = COUNTRIES.find((c) => cleanVal.startsWith(c.dialCode));
      if (matched) {
        setSelectedCountry(matched);
        const maxDigits = getMaxDigitsForCountry(matched.code);
        setLocalNumber(cleanVal.slice(matched.dialCode.length).trim().replace(/\D/g, '').slice(0, maxDigits));
        return;
      }
    }

    const matchedNoPlus = COUNTRIES.find((c) => cleanVal.startsWith(c.dialCode.replace('+', '')));
    if (matchedNoPlus) {
      setSelectedCountry(matchedNoPlus);
      const maxDigits = getMaxDigitsForCountry(matchedNoPlus.code);
      setLocalNumber(cleanVal.slice(matchedNoPlus.dialCode.length - 1).trim().replace(/\D/g, '').slice(0, maxDigits));
      return;
    }

    const maxDigits = getMaxDigitsForCountry(selectedCountry.code);
    setLocalNumber(cleanVal.replace(/\D/g, '').slice(0, maxDigits));
  }, [value, selectedCountry.code]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleCountrySelect = (country: CountryOption) => {
    setSelectedCountry(country);
    setIsOpen(false);
    const maxDigits = getMaxDigitsForCountry(country.code);
    const cleanedDigits = localNumber.replace(/\D/g, '').slice(0, maxDigits);
    setLocalNumber(cleanedDigits);
    if (cleanedDigits) {
      const isValid = cleanedDigits.length === maxDigits;
      onChange(`${country.dialCode}${cleanedDigits}`, isValid);
    } else {
      onChange('', !required);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const maxDigits = getMaxDigitsForCountry(selectedCountry.code);
    // Control estricto: Limpiar caracteres no numéricos y truncar según país
    const pureDigits = rawVal.replace(/\D/g, '').slice(0, maxDigits);
    setLocalNumber(pureDigits);

    if (pureDigits) {
      const isValid = pureDigits.length === maxDigits;
      onChange(`${selectedCountry.dialCode}${pureDigits}`, isValid);
    } else {
      onChange('', !required);
    }
  };

  const maxDigits = getMaxDigitsForCountry(selectedCountry.code);

  return (
    <div className={`relative flex items-center w-full min-w-0 max-w-full ${className}`} ref={dropdownRef}>
      {/* Country Selector Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-auto flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-slate-900 border border-r-0 border-slate-700/80 rounded-l-xl text-xs font-semibold text-slate-200 hover:bg-slate-800/80 hover:border-slate-600 transition-colors focus:outline-none focus:border-amber-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Seleccionar país"
        aria-expanded={isOpen}
      >
        <span className="text-base leading-none select-none">{selectedCountry.flag}</span>
        <span className="text-slate-300 font-mono text-xs">{selectedCountry.dialCode}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Local Phone Input with dynamic maxLength */}
      <div className="relative flex-1 min-w-0 w-full">
        <input
          id={id}
          name={name}
          type="tel"
          maxLength={maxDigits}
          required={required}
          disabled={disabled}
          placeholder={placeholder || `Ej. ${selectedCountry.placeholder}`}
          value={localNumber}
          onChange={handleInputChange}
          className="w-full min-w-0 flex-1 px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-r-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono"
        />
      </div>

      {/* Country Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-64 max-h-60 overflow-y-auto bg-[#12151b] border border-slate-700 rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
            Selecciona tu país
          </div>
          {COUNTRIES.map((country) => {
            const isSelected = country.code === selectedCountry.code;
            return (
              <button
                key={country.code}
                type="button"
                onClick={() => handleCountrySelect(country)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer text-left ${
                  isSelected
                    ? 'bg-amber-500/15 text-amber-300 font-medium'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base leading-none">{country.flag}</span>
                  <span className="truncate">{country.name}</span>
                </div>
                <span className="font-mono text-xs text-slate-400 shrink-0 font-medium">
                  {country.dialCode}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
