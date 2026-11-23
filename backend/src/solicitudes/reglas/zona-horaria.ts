import type { FechaCivil } from './fecha-civil';

/**
 * Conversión de instantes UTC a la hora civil del Estudio C (Decisión D-K).
 *
 * Las reglas de negocio se evalúan siempre en la hora de Bogotá, nunca en la
 * del proceso: por eso aquí no aparece ningún método local de `Date`
 * (`getHours`, `getDate`…). La zona se delega a la base IANA vía `Intl`.
 */
export const ZONA_HORARIA_INSTITUCIONAL = 'America/Bogota';

export const MS_POR_MINUTO = 60_000;
export const MS_POR_HORA = 60 * MS_POR_MINUTO;

/** Fecha y hora local de un instante, con precisión de milisegundos (D-O). */
export interface MomentoLocal {
  readonly fecha: FechaCivil;
  /** Milisegundos desde la medianoche local: 0 … 86_399_999. */
  readonly msDelDia: number;
}

/**
 * Se crea una sola vez: construir un `Intl.DateTimeFormat` es costoso.
 *
 * `hourCycle: 'h23'` es obligatorio: con `hour12: false` algunos motores
 * escriben la medianoche como "24" en lugar de "00".
 */
const FORMATEADOR = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_HORARIA_INSTITUCIONAL,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

type ParteNumerica = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

function leerParte(
  partes: readonly Intl.DateTimeFormatPart[],
  tipo: ParteNumerica,
): number {
  const parte = partes.find((p) => p.type === tipo);
  const valor = parte === undefined ? Number.NaN : Number(parte.value);
  if (!Number.isInteger(valor)) {
    // Fail-closed: si Intl cambiara su formato, preferimos un error a una
    // hora inventada.
    throw new RangeError(`No se pudo leer "${tipo}" de la hora local.`);
  }
  return valor;
}

export function aMomentoLocal(instante: Date): MomentoLocal {
  if (Number.isNaN(instante.getTime())) {
    throw new RangeError('Instante inválido.');
  }

  const partes = FORMATEADOR.formatToParts(instante);
  const hora = leerParte(partes, 'hour');
  const minuto = leerParte(partes, 'minute');
  const segundo = leerParte(partes, 'second');

  return {
    fecha: {
      anio: leerParte(partes, 'year'),
      mes: leerParte(partes, 'month'),
      dia: leerParte(partes, 'day'),
    },
    // Los desfases de las zonas IANA actuales son de segundos completos, así
    // que los milisegundos UTC coinciden con los locales.
    msDelDia:
      hora * MS_POR_HORA +
      minuto * MS_POR_MINUTO +
      segundo * 1000 +
      instante.getUTCMilliseconds(),
  };
}
