# Plan de Implementación: Sincronización de Disponibilidad, Restricción Bidireccional y Días Rápidos

Solución integral a las tres inconsistencias de agenda en BarberSync: sincronización bidireccional entre días de atención y descanso con purga de excepciones vencidas, restricción de reservas simétrica (+/- 6 días) y alineación dinámica de la cinta de selección rápida con el motor de validación del calendario.

## Decisiones Críticas y Resumen de Cambios

> [!IMPORTANT]
> - **Sincronización Bidireccional (Días Laborales vs Descanso)**: El selector "¿Qué día descansarás esta semana?" y los botones de días laborales ('Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom') se vincularán de forma simétrica e instantánea. Desmarcar un día fija automáticamente ese día como descanso, y cambiar el descanso en el menú desmarca el botón respectivo sin desconfigurar el resto de la semana.
> - **Limpieza de Excepciones Caducadas**: Al cargar desde Supabase, en el almacenamiento local y al montar los componentes de configuración, cualquier excepción horaria con fecha anterior a la fecha actual (`date < hoy`) se descarta y limpia automáticamente del registro.
> - **Restricción Bidireccional Simétrica ([-6 días, +6 días])**: Para cada cita activa de un cliente en la fecha $D$, se inhabilitan todos los días desde $D - 6$ hasta $D + 6$ (13 días en total alrededor de la cita). Esto erradica la posibilidad de reservar turnos acumulados antes o después.
> - **Tira Rápida Dinámica con Validador Real**: Se sustituye el cálculo estático de fechas por una iteración que evalúa cada día desde hoy con la misma función `isDateAvailable` del calendario hasta recolectar exactamente los 6 primeros días habilitados, garantizando coherencia al cancelar reservas.

---

## 1. Visión General del Comportamiento

```
┌────────────────────────────────────────────────────────────────────────┐
│                   BARBERSYNC - MOTOR DE DISPONIBILIDAD                 │
├────────────────────────────────┬───────────────────────────────────────┤
│    Configuración del Barbero   │        Experiencia del Cliente        │
│                                │                                       │
│  [Lun][Mar][Mié][Jue][Vie][Sáb]│   Tira Rápida: [ 6 Días Habilitados ] │
│  [Dom] (Desmarcado)            │   ├── Iteración desde HOY hacia +     │
│       ▲                        │   ├── Filtra descansos del barbero    │
│       │ 1:1 Bidireccional      │   └── Filtra restricción [D-6, D+6]   │
│       ▼                        │                                       │
│  Descanso: "Domingo"           │   Calendario Completo (Mes)           │
│                                │   └── Misma regla isDateAvailable()   │
│  Excepciones Activas           │                                       │
│  └── Filtro: date >= hoy       │   Al cancelar cita:                   │
│      (Vencidas se purgan)      │   └── Actualización reactiva instant  │
└────────────────────────────────┴───────────────────────────────────────┘
```

1. **Barbero en Configuración de Disponibilidad**:
   - Al marcar o desmarcar días de la semana, el día de descanso programado se actualiza de inmediato para reflejar el día libre.
   - Si se selecciona "No descansaré", los 7 días quedan activos.
   - Si se selecciona un día en el selector desplegable (ej. "Domingo"), el botón correspondiente se apaga inmediatamente.
   - La lista de horarios especiales por fecha puntual se mantiene limpia de fechas pasadas.

2. **Cliente en el Proceso de Reserva**:
   - Al poseer un turno activo el día $D$, el calendario bloquea tanto el pasado inmediato ($D-6$ hasta $D-1$) como el futuro cercano ($D$ hasta $D+6$).
   - La cinta horizontal superior de selección rápida ya no muestra fechas desfasadas ni salta a meses futuros; busca desde hoy los primeros 6 días en que el cliente efectivamente puede agendar turno.
   - Al cancelar una cita, los días previamente bloqueados se liberan de inmediato y la tira rápida vuelve a mostrar las opciones más próximas.

---

## 2. Experiencia de Usuario y Flujos de Interacción

### Flujo 1: Configuración de Disponibilidad del Barbero
1. El barbero abre **"Configurar Disponibilidad"**.
2. Al desmarcar el botón **"Dom"**, el selector "¿Qué día descansarás esta semana?" cambia instantáneamente a **"Domingo"**.
3. Si el barbero cambia el selector a **"Lunes"**, el botón **"Lun"** se desmarca y el botón **"Dom"** vuelve a encenderse si estaba activo.
4. Si selecciona **"No descansaré"**, los 7 botones de lunes a domingo quedan activos.
5. Al cargar o guardar, las excepciones pasadas de "Horario Especial por Día" se limpian sin intervención manual, evitando acumulaciones obsoletas.

### Flujo 2: Agendamiento de Clientes con Frecuencia Bidireccional
1. Un cliente con cita para el día 20 de noviembre intenta agendar una nueva cita.
2. Los días entre el 14 y el 26 de noviembre (rango $[-6, +6]$) se muestran visualmente deshabilitados con el motivo informativo de restricción de frecuencia.
3. El cliente no puede reservar citas en días consecutivos ni antes ni después de su turno activo.

### Flujo 3: Tira Horizontal de Días Rápidos Sincronizada
1. La cinta superior de accesos directos ya no genera 6 días correlativos ciegos a partir de una fecha arbitraria.
2. Se ejecuta un bucle a partir de hoy evaluando cada día con el mismo validador del calendario:
   - ¿Es fecha pasada? $\rightarrow$ Omitir.
   - ¿El barbero descansa ese día (sin excepción horaria activa)? $\rightarrow$ Omitir.
   - ¿Está restringido por la ventana $[-6, +6]$ del cliente? $\rightarrow$ Omitir.
   - ¿Está fuera del límite de 31 días hábiles? $\rightarrow$ Omitir.
3. Se toman exactamente los primeros 6 días que aprueben la validación.
4. Si el cliente cancela un turno activo, el estado reactivo actualiza la disponibilidad y la tira rápida se reconstituye en 0 ms con los días liberados.

---

## 3. Decisiones de Producto y Arquitectura Técnica

```
┌────────────────────────────────────────────────────────────────────────┐
│                   DIAGRAMA DE ARQUITECTURA Y ESTADO                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────────────┐     ┌──────────────────────────────────┐
│   Configuración de Horarios   │     │    Validador de Disponibilidad   │
│   (BarberAvailabilitySettings │     │    (dateUtils & ClientBooking)   │
│   & BusinessProfileModal)     │     │                                  │
│                               │     │  getFrequencyRestrictedDates():  │
│  - syncScheduleInstantly()    │     │  ├── Rango: [D - 6, D + 6]       │
│  - handleRestDayChange()      │     │  └── earliestAllowedDateByDate   │
│  - toggleDay()                │     │                                  │
│  - purgeExpiredExceptions()   │     │  isDateAvailable(dateStr):       │
│                               │     │  ├── Check Barber working days   │
│  Persistencia:                │     │  ├── Check Special exceptions    │
│  storageService (Supabase/LS) │     │  └── Check Frequency range       │
└───────────────────────────────┘     └─────────────────┬────────────────┘
                                                        │
                                                        ▼
                                      ┌──────────────────────────────────┐
                                      │   quickDays (Tira Horizontal)    │
                                      │   - Bucle desde HOY              │
                                      │   - Filtra con isDateAvailable   │
                                      │   - Detener al recolectar 6 días │
                                      └──────────────────────────────────┘
```

### Decisión 1: Sincronización Bidireccional Limpia y Sin Efectos Secundarios
- **Enfoque**: Manejar la correspondencia directa entre el conjunto de días laborales `workingDays: number[]` (donde 0 es Domingo y 1..6 son Lunes..Sábado) y `restDay: string` ('0'..'6' o 'none'). Al modificar uno, se actualiza el otro de forma determinista y se sincroniza en memoria y almacenamiento sin provocar reescrituras erróneas de los demás días.
- **Beneficio**: Elimina los estados discordantes donde la matriz mostraba "Día de Descanso Programado" en días que el barbero tenía encendidos en su perfil.

### Decisión 2: Restricción Bidireccional en `getFrequencyRestrictedDates`
- **Enfoque**: Para cada cita con estado activo (`confirmed`, `in_progress`, `pending`), recorrer un desplazamiento `offset` desde `-6` hasta `+6`. El día $D + 7$ se computa como la siguiente fecha habilitada hacia adelante.
- **Beneficio**: Garantiza una separación mínima estricta de una semana entre cualquier turno del cliente, impidiendo reservas adyacentes anteriores o posteriores.

### Decisión 3: Generación de la Tira Rápida Basada en Filtro Dinámico
- **Enfoque**: Extraer la lógica de validación de fechas a una función unificada `isDateAvailable(dateStr)` compartida entre la vista de mes del calendario y la tira rápida. Iterar a partir de hoy acumulando días válidos hasta completar 6 elementos.
- **Beneficio**: Coherencia total entre la tira rápida y el calendario; cuando una cita se cancela o un horario se modifica, la tira refleja exactamente los mismos días elegibles en tiempo real.

---

## 4. Fases de Ejecución

1. **Fase 1: Utilidades de Fecha y Validación Simétrica (`dateUtils.ts`)**
   - Actualizar `getFrequencyRestrictedDates` para iterar en el intervalo $[-6, +6]$ días para cada cita activa.
   - Ajustar el cálculo de fecha mínima permitida y razones de bloqueo.

2. **Fase 2: Sincronización de Disponibilidad y Purga de Excepciones (`BarberAvailabilitySettings.tsx`, `BarberBusinessProfileModal.tsx`, `storageService.ts`)**
   - Implementar el enlace bidireccional en `BarberAvailabilitySettings` entre `workingDays` y `restDay`.
   - Implementar la función de saneamiento que filtra excepciones donde `date < hoy` en la carga y guardado de disponibilidad en `storageService`, `BarberAvailabilitySettings` y `BarberBusinessProfileModal`.
   - Ajustar `BarberBusinessProfileModal` para no forzar `restDay = '0'` si el domingo es día laboral.

3. **Fase 3: Refactorización de la Tira Rápida (`ClientBookingFlow.tsx`)**
   - Unificar la validación de disponibilidad en `isDateAvailable`.
   - Reemplazar la llamada estática `getNextDays(6, ...)` por la búsqueda secuencial de los 6 primeros días habilitados desde hoy.
   - Asegurar que al cancelar una cita, `effectiveAppointments` active la reevaluación instantánea de los días rápidos y del calendario.

4. **Fase 4: Verificación y Compilación**
   - Comprobar la compilación y tipado con `compile_applet` y `lint_applet`.
   - Verificar casos límite (todas las citas canceladas, días de descanso alternos, excepciones para hoy y fechas futuras).
