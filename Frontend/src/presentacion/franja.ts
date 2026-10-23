import { MENSAJE_FIN_NO_POSTERIOR } from '../api/mensajes'
import { aCamposBogota, aIsoBogota } from '../fechas/bogota'

/**
 * Franja de una reserva (fecha + horas) tal como la escribe una persona: B2 la usa para
 * radicar y C4 (6.5.4b) para proponer una reprogramación. Extraída de Dashboard en la
 * 6.5.4a SIN cambiar su comportamiento: las mismas dos reglas, en el mismo orden.
 */

/**
 * DH4: el cliente solo valida "fin posterior al inicio". Los bloques, los días hábiles
 * y los festivos los decide el servidor (CA-04): aquí solo se informan.
 */
export const TEXTO_BLOQUES_ATENCION =
  'Atención: lunes a viernes hábiles, de 8:00 a 12:00 y de 14:00 a 18:00 (hora de Colombia).'

export const TEXTO_FRANJA_INVALIDA = 'Revisa la fecha y las horas: no son válidas.'

/** Los valores de los tres campos: `YYYY-MM-DD` y `HH:MM`, como los entregan los `<input>`. */
export interface ValoresFranja {
  readonly fecha: string
  readonly horaInicio: string
  readonly horaFin: string
}

export const FRANJA_VACIA: ValoresFranja = { fecha: '', horaInicio: '', horaFin: '' }

export type ResultadoFranja =
  | { readonly ok: true; readonly inicio: string; readonly fin: string }
  | { readonly ok: false; readonly error: string }

/** Los tres campos tienen algo escrito (para bloquear la confirmación antes de validar). */
export function franjaCompleta({ fecha, horaInicio, horaFin }: ValoresFranja): boolean {
  return fecha !== '' && horaInicio !== '' && horaFin !== ''
}

export function franjaDesdeCampos({ fecha, horaInicio, horaFin }: ValoresFranja): ResultadoFranja {
  // DH1 · F2a: la hora elegida ES la hora de Bogotá, desde cualquier equipo. El ISO lleva
  // el desfase explícito y nunca pasa por la zona del navegador.
  const inicio = aIsoBogota(fecha, horaInicio)
  const fin = aIsoBogota(fecha, horaFin)
  if (inicio === null || fin === null) return { ok: false, error: TEXTO_FRANJA_INVALIDA }

  // DH4 · F3: la única regla local. "HH:MM" con ceros a la izquierda se compara como texto.
  if (horaFin <= horaInicio) return { ok: false, error: MENSAJE_FIN_NO_POSTERIOR }

  return { ok: true, inicio, fin }
}

/**
 * Fase 7 · 7B.3: la franja GUARDADA en los tres campos, para que "Validar con ajustes" parta
 * de lo que pidió el solicitante. Si no se puede leer o no cabe en un solo día (CA-04), los
 * campos quedan vacíos: el Staff la escribe y nada se inventa.
 */
export function camposDeLaFranja(inicioIso: string, finIso: string): ValoresFranja {
  const inicio = aCamposBogota(inicioIso)
  const fin = aCamposBogota(finIso)
  if (inicio === null || fin === null || inicio.fecha !== fin.fecha) return FRANJA_VACIA
  return { fecha: inicio.fecha, horaInicio: inicio.hora, horaFin: fin.hora }
}

/** Los tres campos coinciden. Comparación de texto: los `<input>` ya entregan un formato fijo. */
export function mismaFranja(a: ValoresFranja, b: ValoresFranja): boolean {
  return a.fecha === b.fecha && a.horaInicio === b.horaInicio && a.horaFin === b.horaFin
}
