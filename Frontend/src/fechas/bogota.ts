/**
 * Fechas del Estudio C, SIEMPRE en la hora de Bogotá (Fase 6.3 · Decisiones DH1 a DH3).
 *
 * El Estudio C es un lugar físico en Pasto: "8:00" significa las 8:00 de Colombia,
 * sin importar la zona horaria del equipo desde el que se reserve o se consulte.
 * Ninguna función de este módulo usa la zona del navegador (ni `new Date(texto local)`,
 * ni getHours(), ni toLocale*String() sin timeZone). `npm run test:tz` lo verifica en
 * cuatro zonas horarias.
 */

export const ZONA_ESTUDIO = 'America/Bogota'

/**
 * Colombia no tiene horario de verano desde 1993: el desfase es constante. La prueba
 * canario de bogota.test.ts lo compara con lo que reporta Intl durante todo el año.
 */
export const DESFASE_BOGOTA = '-05:00'

const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
const PATRON_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/

/** ¿Existe ese día en el calendario? (rechaza 2026-02-30 o el 29 de febrero de un año no bisiesto). */
function esFechaReal(anio: number, mes: number, dia: number): boolean {
  const comprobada = new Date(Date.UTC(anio, mes - 1, dia))
  return comprobada.getUTCFullYear() === anio && comprobada.getUTCMonth() === mes - 1 && comprobada.getUTCDate() === dia
}

/**
 * DH1: une la fecha (`YYYY-MM-DD`, la de `<input type="date">`) y la hora (`HH:MM`, la
 * de `<input type="time">`) en un instante ISO 8601 con el desfase de Bogotá explícito:
 * `aIsoBogota('2026-10-20', '08:00')` → `'2026-10-20T08:00:00-05:00'`. No pasa por
 * `Date`, así que el navegador no interpreta nada. Devuelve null si la entrada no es
 * una fecha y una hora reales (el backend tampoco las aceptaría).
 */
export function aIsoBogota(fecha: string, hora: string): string | null {
  const partesFecha = PATRON_FECHA.exec(fecha)
  if (partesFecha === null || !PATRON_HORA.test(hora)) return null
  const [, anio, mes, dia] = partesFecha.map(Number)
  if (anio === undefined || mes === undefined || dia === undefined || !esFechaReal(anio, mes, dia)) return null
  return `${fecha}T${hora}:00${DESFASE_BOGOTA}`
}

const FORMATO_DIA_ISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_ESTUDIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * DH3: el día de HOY en Bogotá, como `YYYY-MM-DD` (para el `min` del calendario).
 * Recibe el "ahora" como parámetro, como el Reloj del backend: las pruebas fijan el
 * instante. `new Date().toISOString().split('T')[0]` daba el día en UTC, que desde las
 * 7:00 p. m. de Colombia ya es mañana (F2c).
 */
export function hoyEnBogota(ahora: Date): string {
  const partes = FORMATO_DIA_ISO.formatToParts(ahora)
  const valor = (tipo: Intl.DateTimeFormatPartTypes): string => partes.find((p) => p.type === tipo)?.value ?? ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

// DH2: formateadores creados UNA vez (crearlos en cada render es costoso).
const FORMATO_FECHA = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_ESTUDIO,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const FORMATO_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_ESTUDIO,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23', // 24 horas: sin la ambigüedad de "a. m." y "p. m." en una reserva.
})

/** Texto para una fecha que no se pudo interpretar: la UI nunca muestra "Invalid Date". */
export const FECHA_NO_DISPONIBLE = 'Fecha no disponible'

function instante(iso: string): Date | null {
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

/** "martes, 20 de octubre de 2026" (en Bogotá). */
export function formatearFecha(iso: string): string {
  const fecha = instante(iso)
  return fecha === null ? FECHA_NO_DISPONIBLE : FORMATO_FECHA.format(fecha)
}

/** "08:00" (en Bogotá, 24 horas). */
export function formatearHora(iso: string): string {
  const fecha = instante(iso)
  return fecha === null ? FECHA_NO_DISPONIBLE : FORMATO_HORA.format(fecha)
}

/** "martes, 20 de octubre de 2026 · 08:00 – 10:00". Las franjas son de un solo día (CA-04). */
export function formatearFranja(inicioIso: string, finIso: string): string {
  if (instante(inicioIso) === null || instante(finIso) === null) return FECHA_NO_DISPONIBLE
  return `${formatearFecha(inicioIso)} · ${formatearHora(inicioIso)} – ${formatearHora(finIso)}`
}
