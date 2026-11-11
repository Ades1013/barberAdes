import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Barber } from '../../types';
import { MapPin, Navigation, Sparkles, Star, Building2, Check, Scissors } from 'lucide-react';

export const BARBER_COORDINATES: Record<string, { lat: number; lng: number; address: string }> = {
  'b-marcos': { lat: 6.3345, lng: -75.5565, address: 'Calle 32 # 50-24, Barrio Obrero' },
  'b-mateo': { lat: 6.3360, lng: -75.5580, address: 'Carrera 51 # 34-18, Barrio Obrero' },
  'b-diego': { lat: 6.3328, lng: -75.5552, address: 'Calle 30 # 49-12, Sector Obrero' },
};

const BARRIO_OBRERO_CENTER: [number, number] = [6.3345, -75.5565];
const DEFAULT_ZOOM = 15;

interface BarberInteractiveMapProps {
  barbers: Barber[];
  selectedBarberId: string;
  onSelectBarber: (barberId: string) => void;
  onCloseMap?: () => void;
  targetAddress?: string;
}

export const BarberInteractiveMap: React.FC<BarberInteractiveMapProps> = ({
  barbers,
  selectedBarberId,
  onSelectBarber,
  onCloseMap,
  targetAddress = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const searchMarkerRef = useRef<L.Marker | null>(null);
  const [geocodingStatus, setGeocodingStatus] = React.useState<string | null>(null);
  const [currentLocationName, setCurrentLocationName] = React.useState<string>('Barrio Obrero, Bello');
  const [currentCoords, setCurrentCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  const [isLocatingGPS, setIsLocatingGPS] = React.useState<boolean>(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Inicializar mapa de Leaflet
    const map = L.map(mapContainerRef.current, {
      center: BARRIO_OBRERO_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });

    // Capa de mosaicos OpenStreetMap 100% gratuita
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    // Invalidate size para asegurar renderizado correcto en contenedores dinámicos
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current = {};
      if (searchMarkerRef.current) {
        searchMarkerRef.current = null;
      }
    };
  }, []);

  // Actualizar o agregar marcadores para los barberos
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Limpiar marcadores existentes de barberos
    Object.values(markersRef.current).forEach((marker) => marker.remove());
    markersRef.current = {};

    barbers.forEach((barber) => {
      const coords = barber.coordinates || BARBER_COORDINATES[barber.id];
      if (!coords) return;

      const address = barber.address || BARBER_COORDINATES[barber.id]?.address || 'Barbería BarberAdes';
      const isSelected = barber.id === selectedBarberId;

      // Pin personalizado con la estética ámbar/dorada de BarberAdes
      const customIcon = L.divIcon({
        className: 'custom-barber-marker-wrapper',
        html: `
          <div style="position: relative; width: 40px; height: 46px; cursor: pointer;">
            <!-- Onda expansiva de pulso -->
            <div style="position: absolute; top: 0; left: 0; width: 40px; height: 40px; border-radius: 50%; background: ${
              isSelected ? 'rgba(245, 158, 11, 0.45)' : 'rgba(217, 119, 6, 0.25)'
            }; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></div>
            
            <!-- Pin circular ámbar/dorado -->
            <div style="position: relative; width: 36px; height: 36px; margin: 2px auto 0; border-radius: 50%; background: ${
              isSelected ? 'linear-gradient(135deg, #fbbf24, #d97706)' : 'linear-gradient(135deg, #f59e0b, #b45309)'
            }; border: ${isSelected ? '3px solid #ffffff' : '2px solid #ffffff'}; box-shadow: 0 4px 14px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="6" cy="6" r="3"></circle>
                <circle cx="6" cy="18" r="3"></circle>
                <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
                <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
                <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
              </svg>
            </div>
            
            <!-- Punta inferior del marcador -->
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 7px solid ${
              isSelected ? '#d97706' : '#b45309'
            }; margin: -2px auto 0;"></div>
          </div>
        `,
        iconSize: [40, 46],
        iconAnchor: [20, 46],
        popupAnchor: [0, -46],
      });

      const marker = L.marker([coords.lat, coords.lng], { icon: customIcon }).addTo(map);

      // Popup informativo interactivo
      const popupContent = document.createElement('div');
      popupContent.className = 'barbersync-map-popup p-1 text-slate-100 font-sans';
      popupContent.innerHTML = `
        <div style="min-width: 220px; font-family: 'Plus Jakarta Sans', sans-serif;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #f59e0b; letter-spacing: 0.05em;">
              Barbería Registrada
            </span>
            <span style="font-size: 11px; font-weight: 600; color: #fbbf24; display: flex; align-items: center; gap: 3px;">
              ★ ${barber.rating}
            </span>
          </div>

          <h3 style="font-size: 14px; font-weight: 800; color: #ffffff; margin: 0 0 2px 0; line-height: 1.2;">
            ${barber.name}
          </h3>
          
          <div style="font-size: 12px; font-weight: 600; color: #fbbf24; margin-bottom: 4px;">
            ${barber.nickname || barber.specialty}
          </div>

          <div style="font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 4px; margin-bottom: 10px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            <span>${address}</span>
          </div>

          <button
            id="select-barber-btn-${barber.id}"
            style="width: 100%; padding: 8px 12px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #090d16; font-size: 11px; font-weight: 800; border: none; border-radius: 8px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.03em; transition: all 0.2s; box-shadow: 0 4px 10px rgba(245, 158, 11, 0.3);"
          >
            ✂️ Seleccionar este Barbero
          </button>
        </div>
      `;

      // Event listener para el botón dentro del popup
      const selectBtn = popupContent.querySelector(`#select-barber-btn-${barber.id}`);
      if (selectBtn) {
        selectBtn.addEventListener('click', () => {
          onSelectBarber(barber.id);
          map.closePopup();
          setTimeout(() => {
            const step2El = document.getElementById('step-2-services');
            if (step2El) {
              step2El.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 150);
        });
      }

      marker.bindPopup(popupContent, {
        className: 'custom-leaflet-dark-popup',
        maxWidth: 280,
      });

      if (isSelected) {
        setTimeout(() => {
          marker.openPopup();
        }, 300);
      }

      markersRef.current[barber.id] = marker;
    });
  }, [barbers, selectedBarberId, onSelectBarber]);

  // Centrado dinámico con Geocodificación real de OpenStreetMap Nominatim
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const trimmed = targetAddress.trim();
    if (!trimmed) {
      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove();
        searchMarkerRef.current = null;
      }
      setGeocodingStatus(null);
      setCurrentLocationName('Barrio Obrero, Bello');
      setCurrentCoords({ lat: BARRIO_OBRERO_CENTER[0], lng: BARRIO_OBRERO_CENTER[1] });
      map.flyTo(BARRIO_OBRERO_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
      return;
    }

    let isCancelled = false;
    setGeocodingStatus(`Buscando "${trimmed}" en OpenStreetMap...`);

    const geocodeAddress = async () => {
      try {
        // Query con Antioquia, Colombia para priorizar resultados locales en Colombia
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed + ', Antioquia, Colombia')}`,
          {
            headers: {
              'Accept-Language': 'es',
            },
          }
        );

        if (!res.ok) throw new Error('Geocoding response not ok');
        const data = await res.json();

        if (isCancelled || !mapInstanceRef.current) return;

        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          const shortName = data[0].display_name.split(',')[0] || trimmed;

          setCurrentLocationName(shortName);
          setCurrentCoords({ lat, lng: lon });
          setGeocodingStatus(`Ubicación encontrada: ${shortName}`);

          if (searchMarkerRef.current) {
            searchMarkerRef.current.remove();
          }

          // Marcador distintivo azul de búsqueda
          const searchIcon = L.divIcon({
            className: 'custom-search-marker',
            html: `
              <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
                <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: rgba(14, 165, 233, 0.35); animation: pulse 2s infinite;"></div>
                <div style="width: 28px; height: 28px; border-radius: 50%; background: #0284c7; border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: white;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                </div>
              </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });

          const newSearchMarker = L.marker([lat, lon], { icon: searchIcon })
            .addTo(mapInstanceRef.current)
            .bindPopup(`
              <div style="font-family: inherit; font-size: 12px; color: #0f172a; padding: 4px; min-width: 140px;">
                <div style="color: #0284c7; font-weight: 700; font-size: 10px; text-transform: uppercase;">Tu búsqueda</div>
                <strong style="color: #0f172a; font-size: 13px;">${trimmed}</strong><br/>
                <span style="color: #64748b; font-size: 11px;">${shortName}</span>
              </div>
            `);

          searchMarkerRef.current = newSearchMarker;
          mapInstanceRef.current.flyTo([lat, lon], 15, { duration: 1 });

          // Abrir popup de búsqueda brevemente
          setTimeout(() => {
            if (newSearchMarker && mapInstanceRef.current) {
              newSearchMarker.openPopup();
            }
          }, 600);
        } else {
          // Si no encuentra específicamente en Antioquia, intentar búsqueda general
          const resFallback = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed + ', Colombia')}`,
            {
              headers: { 'Accept-Language': 'es' },
            }
          );
          const dataFallback = await resFallback.json();

          if (!isCancelled && mapInstanceRef.current && dataFallback && dataFallback.length > 0) {
            const lat = parseFloat(dataFallback[0].lat);
            const lon = parseFloat(dataFallback[0].lon);
            const shortName = dataFallback[0].display_name.split(',')[0] || trimmed;
            setCurrentLocationName(shortName);
            setCurrentCoords({ lat, lng: lon });
            setGeocodingStatus(`Ubicación: ${shortName}`);
            mapInstanceRef.current.flyTo([lat, lon], 15, { duration: 1 });
          } else {
            setGeocodingStatus(`No se encontró "${trimmed}". Mostrando zona predeterminada.`);
            setCurrentLocationName(trimmed);
          }
        }
      } catch (err) {
        if (!isCancelled && mapInstanceRef.current) {
          console.warn('Geocoding error, falling back:', err);
          setGeocodingStatus(`Error de geocodificación. Mostrando zona predeterminada.`);
        }
      }
    };

    geocodeAddress();

    return () => {
      isCancelled = true;
    };
  }, [targetAddress]);

  // Centrar en la ubicación del dispositivo con GPS (navigator.geolocation)
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('La geolocalización no está soportada por tu navegador');
      return;
    }

    setIsLocatingGPS(true);
    setGeocodingStatus('Detectando ubicación GPS...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocatingGPS(false);
        const { latitude, longitude } = position.coords;
        setCurrentCoords({ lat: latitude, lng: longitude });
        setCurrentLocationName('Mi Ubicación Actual (GPS)');
        setGeocodingStatus('Ubicación GPS obtenida con éxito');

        if (mapInstanceRef.current) {
          if (searchMarkerRef.current) {
            searchMarkerRef.current.remove();
          }

          const gpsIcon = L.divIcon({
            className: 'custom-gps-marker',
            html: `
              <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
                <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: rgba(16, 185, 129, 0.4); animation: pulse 2s infinite;"></div>
                <div style="width: 24px; height: 24px; border-radius: 50%; background: #10b981; border: 2.5px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: white;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M12 2v3m0 14v3M2 12h3m14 0h3"></path>
                  </svg>
                </div>
              </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });

          const newGpsMarker = L.marker([latitude, longitude], { icon: gpsIcon })
            .addTo(mapInstanceRef.current)
            .bindPopup(`
              <div style="font-family: inherit; font-size: 12px; color: #0f172a; padding: 4px;">
                <strong style="color: #10b981;">Estás aquí</strong><br/>
                <span style="color: #64748b; font-size: 11px;">Ubicación de tu dispositivo</span>
              </div>
            `);

          searchMarkerRef.current = newGpsMarker;
          mapInstanceRef.current.flyTo([latitude, longitude], 15, { duration: 1 });
        }
      },
      (err) => {
        setIsLocatingGPS(false);
        console.warn('Geolocation error:', err);
        setGeocodingStatus('No se pudo obtener el GPS. Puedes escribir tu dirección en la casilla.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Centrar en un barbero específico
  const handleFocusBarber = (barber: Barber) => {
    const coords = barber.coordinates || BARBER_COORDINATES[barber.id];
    if (coords && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([coords.lat, coords.lng], 16, { duration: 0.8 });
      const marker = markersRef.current[barber.id];
      if (marker) {
        marker.openPopup();
      }
    }
  };

  // Calcular distancia aproximada si hay coordenadas activas
  const getApproxDistanceKm = (barberCoords?: { lat: number; lng: number }): string | null => {
    if (!currentCoords || !barberCoords) return null;
    const R = 6371; // Radio de la Tierra en km
    const dLat = ((barberCoords.lat - currentCoords.lat) * Math.PI) / 180;
    const dLon = ((barberCoords.lng - currentCoords.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((currentCoords.lat * Math.PI) / 180) *
        Math.cos((barberCoords.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;
    if (dist < 1) {
      return `${Math.round(dist * 1000)} m`;
    }
    return `${dist.toFixed(1)} km`;
  };

  return (
    <div className="space-y-3.5 animate-in fade-in duration-300">
      {/* Barra superior de control del mapa */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Navigation className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">
                {currentLocationName ? `Barberías cerca de ${currentLocationName}` : 'Mapa de Barberías Registradas'}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                OpenStreetMap
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Haz clic en los marcadores dorados para ver la dirección y seleccionar a tu profesional.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {/* Botón Mi Ubicación Actual (GPS) en lugar del botón fijo "Centrar Obrero" */}
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocatingGPS}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            title="Usar GPS del dispositivo para centrar el mapa en tu ubicación actual"
          >
            <Navigation className={`w-3.5 h-3.5 text-emerald-400 ${isLocatingGPS ? 'animate-spin' : ''}`} />
            <span>{isLocatingGPS ? 'Obteniendo GPS...' : 'Mi Ubicación Actual'}</span>
          </button>

          {onCloseMap && (
            <button
              type="button"
              onClick={onCloseMap}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
            >
              Cerrar Mapa
            </button>
          )}
        </div>
      </div>

      {/* Contenedor del Mapa Leaflet */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950">
        <div
          ref={mapContainerRef}
          style={{ height: '420px', width: '100%', zIndex: 10 }}
          className="w-full"
        />

        {/* Badge dinámico de ubicación (sin coordenadas quemadas fijas) */}
        <div className="absolute top-3 left-3 z-[400] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3 py-1.5 rounded-xl shadow-lg flex items-center gap-2 text-xs text-slate-200 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-semibold text-white">{currentLocationName}</span>
          {geocodingStatus && (
            <span className="ml-1 pl-2 border-l border-slate-700 text-amber-300 font-medium text-[11px]">
              {geocodingStatus}
            </span>
          )}
        </div>
      </div>

      {/* Regla 6: Límite estricto de máximo 3 tarjetas de profesionales/barberías simultáneas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {barbers
          .slice()
          .sort((a, b) => {
            if (!currentCoords) return 0;
            const coordsA = a.coordinates || BARBER_COORDINATES[a.id];
            const coordsB = b.coordinates || BARBER_COORDINATES[b.id];
            if (!coordsA || !coordsB) return 0;
            const distA = Math.hypot(coordsA.lat - currentCoords.lat, coordsA.lng - currentCoords.lng);
            const distB = Math.hypot(coordsB.lat - currentCoords.lat, coordsB.lng - currentCoords.lng);
            return distA - distB;
          })
          .slice(0, 3)
          .map((barber) => {
            const coords = barber.coordinates || BARBER_COORDINATES[barber.id];
            const address = barber.address || BARBER_COORDINATES[barber.id]?.address || 'Barrio Obrero';
            const isSelected = barber.id === selectedBarberId;
            const approxDist = getApproxDistanceKm(coords);

            return (
              <div
                key={barber.id}
                onClick={() => handleFocusBarber(barber)}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-slate-900 border-amber-500 shadow-md ring-1 ring-amber-500/40'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg bg-gradient-to-br ${barber.avatarColor} text-white font-bold text-xs flex items-center justify-center shrink-0`}
                    >
                      {barber.name[0]}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{barber.name}</h4>
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[10px] text-amber-400 font-medium truncate">
                          {barber.nickname}
                        </span>
                        {approxDist && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                            {approxDist}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBarber(barber.id);
                      setTimeout(() => {
                        const step2El = document.getElementById('step-2-services');
                        if (step2El) {
                          step2El.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }, 150);
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition-all shrink-0 ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-extrabold'
                        : 'bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300'
                    }`}
                  >
                    {isSelected ? '✓ Elegido' : 'Seleccionar'}
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                  <MapPin className="w-3 h-3 text-amber-400/80 shrink-0" />
                  <span className="truncate">{address}</span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
