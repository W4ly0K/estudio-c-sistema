# ADR-003 — Reglas de horario, días hábiles y zona horaria

| Campo | Valor |
|---|---|
| **Estado** | ✅ Aceptado |
| **Fecha** | 2026-10-01 |
| **Autor** | Sebastián Eraso (Práctica Formativa, Ingeniería de Sistemas) |
| **Rama** | `feat/fase-3-reglas-horario` |
| **Complementa a** | [ADR-001](ADR-001-identidad-zero-trust.md) (el principio Zero Trust se extiende al tiempo: el "ahora" sale del servidor, nunca del cliente) |
| **Relacionado con** | PRD v2.1 §5.4 (bloques de atención) y §6 (anticipación y urgencia) · CA-04 · Pantallas B2 (formulario) y C2 (bandeja con urgencias) |

---

## 1. Contexto

El diagnóstico de la Fase 3 encontró que las reglas de horario de `POST /solicitudes` **dependían del servidor donde se desplegara la API**:

1. **CA-04 usaba `getHours()`**, que lee la hora en la zona horaria del proceso. En un servidor en UTC, las 08:00 de Bogotá son las 13:00: una reserva válida se rechazaba y una de las 03:00 de la madrugada pasaba.
2. **CA-04 estaba incompleto.** Solo se bloqueaba el almuerzo (12:00–14:00). Se aceptaban reservas a las 06:00, de 10:00 a 16:00 (cruzando el almuerzo), con duración cero, terminando al día siguiente, y en sábados, domingos o festivos.
3. **La urgencia contaba días calendario.** Un viernes, "5 días" terminaba el miércoles con solo 3 días hábiles de preparación para el Staff.
4. **`@MinDate(new Date(...))` se evaluaba una sola vez, al cargar el módulo.** El argumento de un decorador se calcula al definir la clase, no en cada petición: con el servidor encendido desde el lunes, el viernes se aceptaban reservas para el martes, miércoles y jueves ya pasados. Además usaba `setHours`, también dependiente de la zona del servidor.
5. **CA-06 (consulta a la BD) se ejecutaba antes que CA-04.** Una petición inválida costaba una consulta.
6. **El año del radicado salía de `getFullYear()`.** En un servidor en UTC, una solicitud del 31 de diciembre a las 20:00 (Bogotá) quedaba con el año siguiente.
7. **`@Type(() => Date)` aceptaba fechas sin zona horaria** (`"2026-10-13T08:00"`), que `new Date()` interpreta en la zona del servidor: el mismo error del punto 1, en la puerta de entrada.

Reglas de negocio acordadas con el responsable del Estudio C para esta fase:

- El Estudio C **no atiende sábados, domingos ni festivos colombianos** (Ley 51 de 1983, "Ley Emiliani").
- **Lectura B de la anticipación:** el Staff necesita **5 días hábiles completos** entre la radicación y la reserva. El día de la radicación nunca cuenta; la reserva deja de ser urgente a partir del **6.º día hábil**.

---

## 2. Decisiones

### Reglas puras, aisladas del framework (Decisiones J y N)

Toda la lógica vive en `src/solicitudes/reglas/` como **funciones puras**: sin reloj, sin base de datos, sin HTTP. Reciben `ahora` y el calendario como parámetros y **devuelven** un resultado; el servicio lo traduce a una excepción.

```ts
type ResultadoHorario =
  | { valido: true; urgente: boolean; fechaMinimaSinUrgencia: FechaCivil }
  | { valido: false; error: ErrorHorario };
```

- **Alternativa descartada:** validar dentro del servicio con `new Date()` y lanzar excepciones. Las pruebas dependerían del día en que se ejecuten.
- ✅ Las reglas se prueban de forma determinista y exhaustiva, sin NestJS.
- ✅ La fecha de radicación y la marca de urgencia **las calcula el servidor**. Si el cliente enviara `urgente: false`, estaría decidiendo su propia prioridad.

### Zona horaria explícita con `Intl` (Decisiones K y O)

Un instante UTC se convierte a la hora civil de **America/Bogota** con `Intl.DateTimeFormat(...).formatToParts()`, y **todas** las reglas se evalúan sobre esa hora civil. No se usa ningún método local de `Date` (`getHours`, `getDay`, `getFullYear`…).

- **Alternativas descartadas:** una librería (Luxon, date-fns-tz): otra dependencia sin necesidad, porque Node incluye ICU completo. Fijar UTC−5 en el código: correcto hoy (Colombia no tiene horario de verano desde 1993), pero deja cada regla atada a un dato escrito a mano.
- ✅ `hourCycle: 'h23'` es obligatorio: con `hour12: false` algunos motores escriben la medianoche como "24".
- ✅ **Precisión de milisegundos (D-O).** Comparar minutos dejaba un hueco: una reserva que terminaba a las 12:00:30 daba "minuto 720" y pasaba.

### CA-04 como intervalo semiabierto y orden fijo de validación (Decisiones L, P y Q)

La reserva debe caber **completa** en un bloque `[08:00, 12:00)` o `[14:00, 18:00)`: terminar exactamente a las 12:00 es válido. Las validaciones se evalúan siempre en este orden, de la más simple a la más específica:

| # | Código | Regla |
|---|---|---|
| 1 | `FIN_NO_POSTERIOR` | `fin > inicio` |
| 2 | `EN_EL_PASADO` | `inicio > ahora` (reemplaza al `@MinDate` congelado) |
| 3 | `MULTIPLES_DIAS` | Inicio y fin en la misma fecha de Bogotá |
| 4 | `DIA_NO_HABIL` | Ni sábado, ni domingo, ni festivo |
| 5 | `FUERA_DE_BLOQUE` | Dentro de un bloque de atención |

- ✅ Una entrada con varios errores recibe siempre el mismo mensaje.
- ✅ **D-Q:** los mensajes son un `Record<ErrorHorario, string>`. Un código nuevo sin mensaje **no compila**.

### Calendario laboral calculado, detrás de una interfaz (Decisiones M, R y V)

Los 18 festivos de la Ley 51 de 1983 se **calculan**: 6 fijos, 7 trasladables al lunes y 5 que dependen del Domingo de Pascua, obtenido con el algoritmo de **Meeus/Jones/Butcher**. El código replica la estructura de la ley (`desdePascuaTrasladable(39, 'Ascensión del Señor')`), para que pueda contrastarse con ella línea por línea.

- **Alternativas descartadas:** una tabla en la BD como única fuente (si el Staff olvida cargar el año, el sistema falla sin avisar) y un paquete de npm (riesgo en la cadena de suministro).
- ✅ Todo queda detrás de la interfaz `CalendarioLaboral { esDiaHabil(fecha) }`. Los cierres institucionales de CESMAG (receso de diciembre, Semana Santa completa) podrán agregarse **sin tocar las reglas**.
- ℹ️ **D-V:** mientras no existan esos cierres, el servicio importa `calendarioLaboralColombia` directamente, porque es una constante pura. Se convertirá en proveedor cuando dependa de la BD.
- ℹ️ **Algunos años tienen 17 festivos distintos.** El Sagrado Corazón y San Pedro y San Pablo coinciden algunos lunes (por ejemplo, el 30 de junio de 2025). La ley no prevé compensación.
- ✅ **D-R:** las fechas civiles se comparan como año, mes y día (`compararFechas`), sin convertirlas en instantes.

### Urgencia por 5 días hábiles completos (Lectura B) y tope anticolapso (Decisiones S y T)

`fechaMinimaSinUrgencia(radicacion)` es el 6.º día hábil estrictamente posterior a la fecha de radicación en Bogotá. Una reserva es urgente si su fecha es anterior.

| Radicación | Mínima sin urgencia |
|---|---|
| Lun 5 oct 2026 (el 12 es festivo) | Mié 14 oct |
| Lun 22 mar 2027 (festivo y Semana Santa en medio) | Jue 1 abr |
| Jue 24 dic 2026 (cruce de año) | Mar 5 ene 2027 |

- ✅ **D-S:** la búsqueda de días hábiles tiene un tope de 366 días. Con un calendario mal configurado que nunca devuelva un día hábil, un ciclo sin tope **bloquearía el event loop de Node**, es decir, el servidor completo y no solo la petición.
- ✅ El resultado incluye `fechaMinimaSinUrgencia`, para que el frontend sugiera la fecha (PRD §6) **sin repetir el cálculo**.

### Integración con NestJS (Decisiones U, W y X)

**D-U · `Reloj` como clase abstracta inyectable.** Una clase abstracta existe en tiempo de ejecución y sirve como token de inyección (`constructor(reloj: Reloj)`), sin cadenas mágicas. `create()` llama **una sola vez** a `ahora()`: la validación, la urgencia y el año del radicado corresponden al mismo instante, sin carreras a medianoche. Las pruebas usan `RelojFijo`.

**D-W · Fechas de entrada con zona horaria obligatoria.** `@FechaConZonaHoraria()` solo acepta ISO 8601 terminado en `Z` o `±HH:MM`. Además verifica **campo por campo** que la fecha exista: V8 convierte en silencio `2026-02-30` en el 2 de marzo y `T24:00` en el día siguiente, sin producir un `Date` inválido.

**D-X · Pruebas en varias zonas horarias.** Jest entrega a cada suite una **copia** de `process.env`, así que la zona no puede cambiarse desde una prueba. `npm run test:tz` (`scripts/test-zonas-horarias.mjs`) relanza las pruebas de `src/solicitudes` con `TZ` = UTC, America/Bogota, Pacific/Pago_Pago (UTC−11) y Pacific/Kiritimati (UTC+14), sin dependencias. Una precondición basada en `Intl` comprueba que el proceso realmente cambió de zona, para evitar falsos verdes.

**Orden final de `create()`:**

```
ahora (una vez) → evaluarHorario (puro, sin BD) → CA-06 (BD) → radicado con año de Bogotá → persistencia con es_urgencia
```

---

## 3. Verificación

| Decisión | Pruebas que la protegen |
|---|---|
| J, N | `horario.validator.spec.ts` (contrato `ResultadoHorario`; la urgencia no se calcula sobre una franja inválida) |
| K, O | `zona-horaria.spec.ts` (medianoche "00", límites de día y de año, regresión de `08:00Z` = 03:00) · `test:tz` en 4 zonas |
| L, P, Q | `horario.validator.spec.ts` (límites al milisegundo, cruce del almuerzo, precedencia) · un caso por código en `solicitudes.service.spec.ts` |
| M, R | `calendario-colombia.spec.ts` (oráculos oficiales 2026–2027, Pascua 1984–2500, días hábiles día por día 2026–2030, coincidencia de 2025) |
| S, T | `urgencia.spec.ts` (oráculos de la Lectura B, propiedad "exactamente 5 días hábiles" 2026–2030, tope con un calendario espía) |
| U | `solicitudes.service.spec.ts` (urgencia con `RelojFijo`; el reloj se consulta **una vez**; año del radicado en Bogotá) |
| W | `fecha-con-zona-horaria.decorator.spec.ts` (22 casos) · `update-solicitude.dto.spec.ts` · e2e 21 |
| Reordenamiento CA-04 → CA-06 | `solicitudes.service.spec.ts` y e2e 20 (`findFirst` no se llama) |
| Retiro de `@MinDate` | `update-solicitude.dto.spec.ts` (el DTO ya no congela la fecha) · e2e 22 (la fecha pasada se sigue rechazando) |

**Pruebas de mutación.** Se aplicaron 29 mutaciones (en copias temporales o con restauración verificada por SHA-256). Algunas:

| Mutación | Detectada por |
|---|---|
| `getUTCDay()` → `getDay()` | Solo por `test:tz` cuando el proceso corre en UTC |
| Quitar `timeZone` del formateador | `test:tz` |
| `hourCycle: 'h23'` → `'h24'` | Prueba de la medianoche |
| Precisión de minutos en lugar de milisegundos | Hueco de las 12:00:30 |
| Lectura A (5.º día hábil en lugar del 6.º) | Oráculos y propiedad de urgencia |
| Quitar el tope de 366 días | El calendario espía corta y la prueba falla en milisegundos |
| Consultar la BD antes de CA-04 | 5 pruebas del servicio |
| `getFullYear()` para el radicado | Solo en UTC: **justifica la Decisión D-X** |
| Volver a poner `@MinDate` | Spec del DTO |

Una mutación sobrevivió (quitar la comparación del día en `parsearFechaConZonaHoraria`), y es **equivalente**: un día fuera de rango siempre cambia también el mes, y esa comparación ya lo rechaza.

**Resultado al cierre:** `npm test` 21 suites y 217 pruebas (216 ✅ y 1 omitida por diseño) · `npm run test:e2e` 3 suites y 23 pruebas ✅ · `npm run test:tz` 4 zonas × 166 pruebas ✅.

## 4. Deuda conocida (fuera del alcance de este ADR)

- **Fase 4:**
  - El mensaje de CA-06 revela el radicado de otra persona (contradice la Decisión H de ADR-002).
  - Revalidar el horario en `update()` cuando cambien las fechas.
  - La condición de carrera de CA-06.
- **Frontend:**
  - Construir las fechas con `-05:00` explícito, no con la zona horaria del navegador.
  - El atributo `min` del campo de fecha se calcula en UTC.
  - Usar `fechaMinimaSinUrgencia` para sugerir la fecha.
  - Mostrar al solicitante urgente la obligación de avisar al Staff (PRD §6).
- **Cierres institucionales** de CESMAG como fuente adicional de `CalendarioLaboral` (BD o configuración).
- **GitHub Actions:** ejecutar `npm run test:tz` en cada PR. Es la única prueba que detecta regresiones de zona horaria cuando el servidor está en UTC.

## 5. Historial de implementación

| Commit | Paso |
|---|---|
| `16869be` | 3.1 · Calendario laboral colombiano (Ley 51/1983), Pascua de Meeus y lanzador multizona |
| `bcbf947` | 3.2 · `HorarioValidator` puro: CA-04, pasado, mismo día y día hábil, con la hora de Bogotá vía `Intl` |
| `18ccbbd` | 3.3 · Urgencia por 5 días hábiles completos (Lectura B) y `evaluarHorario` |
| `23a3dbd` | 3.4 · Integración en `create()` con `Reloj`, retiro de `@MinDate` y `@FechaConZonaHoraria` (un solo commit, por atomicidad de seguridad) |
