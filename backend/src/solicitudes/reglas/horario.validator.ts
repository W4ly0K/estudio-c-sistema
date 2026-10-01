import type { CalendarioLaboral } from './calendario-colombia';
import { aClaveIso, type FechaCivil } from './fecha-civil';
import { esUrgente, fechaMinimaSinUrgencia } from './urgencia';
import { aMomentoLocal, MS_POR_HORA, type MomentoLocal } from './zona-horaria';

/**
 * Validación pura de la franja horaria de una reserva (CA-04 y reglas de
 * fechas de la Fase 3). Sin reloj, sin BD y sin HTTP: recibe `ahora` y el
 * calendario, y devuelve un resultado; el servicio lo traduce a una excepción.
 */

/** Intervalo semiabierto [inicioMs, finMs) en milisegundos del día local. */
export interface BloqueDeAtencion {
  readonly inicioMs: number;
  readonly finMs: number;
}

/** PRD §5.4: 8:00 a.m.–12:00 p.m. y 2:00 p.m.–6:00 p.m. */
export const BLOQUES_DE_ATENCION: readonly BloqueDeAtencion[] = Object.freeze([
  Object.freeze({ inicioMs: 8 * MS_POR_HORA, finMs: 12 * MS_POR_HORA }),
  Object.freeze({ inicioMs: 14 * MS_POR_HORA, finMs: 18 * MS_POR_HORA }),
]);

/** En el orden en que se evalúan (Decisión D-P). */
export type ErrorHorario =
  | 'FIN_NO_POSTERIOR'
  | 'EN_EL_PASADO'
  | 'MULTIPLES_DIAS'
  | 'DIA_NO_HABIL'
  | 'FUERA_DE_BLOQUE';

/**
 * Decisión D-Q: al ser un `Record` sobre la unión, olvidar el mensaje de un
 * código nuevo es un error de compilación. Los mensajes no repiten la entrada.
 */
export const MENSAJES_ERROR_HORARIO: Readonly<Record<ErrorHorario, string>> =
  Object.freeze({
    FIN_NO_POSTERIOR:
      'Error CA-04: La hora de finalización debe ser posterior a la hora de inicio.',
    EN_EL_PASADO:
      'Error CA-04: No se puede programar una solicitud en una fecha u hora pasada.',
    MULTIPLES_DIAS:
      'Error CA-04: La reserva debe iniciar y terminar el mismo día.',
    DIA_NO_HABIL:
      'Error CA-04: El Estudio C no atiende sábados, domingos ni festivos.',
    FUERA_DE_BLOQUE:
      'Error CA-04: El horario debe estar completamente dentro de un bloque de atención (8:00 a.m. – 12:00 p.m. o 2:00 p.m. – 6:00 p.m.).',
  });

export interface FranjaSolicitada {
  readonly inicio: Date;
  readonly fin: Date;
}

export type ResultadoFranja =
  | {
      readonly valido: true;
      readonly inicioLocal: MomentoLocal;
      readonly finLocal: MomentoLocal;
    }
  | { readonly valido: false; readonly error: ErrorHorario };

const rechazo = (error: ErrorHorario): ResultadoFranja => ({
  valido: false,
  error,
});

export function validarFranjaHoraria(
  franja: FranjaSolicitada,
  ahora: Date,
  calendario: CalendarioLaboral,
): ResultadoFranja {
  const inicioMs = franja.inicio.getTime();
  const finMs = franja.fin.getTime();
  const ahoraMs = ahora.getTime();

  // Fail-closed: con NaN todas las comparaciones dan false y la franja
  // "pasaría". Un Date inválido es un error de programación, no una regla.
  if (Number.isNaN(inicioMs) || Number.isNaN(finMs) || Number.isNaN(ahoraMs)) {
    throw new RangeError('Instante inválido en la validación de horario.');
  }

  // 1. Instantes absolutos: no dependen de la zona horaria.
  if (finMs <= inicioMs) {
    return rechazo('FIN_NO_POSTERIOR');
  }
  // 2. Reemplaza al @MinDate evaluado una sola vez al cargar el módulo.
  if (inicioMs <= ahoraMs) {
    return rechazo('EN_EL_PASADO');
  }

  // 3–5. Reglas sobre la hora civil de Bogotá.
  const inicioLocal = aMomentoLocal(franja.inicio);
  const finLocal = aMomentoLocal(franja.fin);

  if (aClaveIso(inicioLocal.fecha) !== aClaveIso(finLocal.fecha)) {
    return rechazo('MULTIPLES_DIAS');
  }
  if (!calendario.esDiaHabil(inicioLocal.fecha)) {
    return rechazo('DIA_NO_HABIL');
  }

  // D-L: la franja debe caber COMPLETA en un bloque, con [inicio, fin).
  const cabeEnUnBloque = BLOQUES_DE_ATENCION.some(
    (bloque) =>
      inicioLocal.msDelDia >= bloque.inicioMs &&
      finLocal.msDelDia <= bloque.finMs,
  );
  if (!cabeEnUnBloque) {
    return rechazo('FUERA_DE_BLOQUE');
  }

  return { valido: true, inicioLocal, finLocal };
}

/** Contrato de la Decisión D-N: franja válida + urgencia, o el primer error. */
export type ResultadoHorario =
  | {
      readonly valido: true;
      readonly urgente: boolean;
      /** Para que el frontend sugiera la fecha (PRD §6) sin recalcularla. */
      readonly fechaMinimaSinUrgencia: FechaCivil;
    }
  | { readonly valido: false; readonly error: ErrorHorario };

/**
 * Compone la validación de la franja con la urgencia. La urgencia solo se
 * calcula si la franja es válida: no tiene sentido sobre una reserva rechazada.
 * La fecha de radicación es la fecha de Bogotá de `ahora`, que viene siempre
 * del reloj del servidor (nunca del cliente).
 */
export function evaluarHorario(
  franja: FranjaSolicitada,
  ahora: Date,
  calendario: CalendarioLaboral,
): ResultadoHorario {
  const franjaValidada = validarFranjaHoraria(franja, ahora, calendario);
  if (!franjaValidada.valido) {
    return franjaValidada;
  }

  const radicacion = aMomentoLocal(ahora).fecha;
  const fechaMinima = fechaMinimaSinUrgencia(radicacion, calendario);

  return {
    valido: true,
    urgente: esUrgente(franjaValidada.inicioLocal.fecha, fechaMinima),
    fechaMinimaSinUrgencia: fechaMinima,
  };
}
