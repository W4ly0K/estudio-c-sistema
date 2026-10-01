import type { CalendarioLaboral } from './calendario-colombia';
import {
  asegurarFechaCivilValida,
  compararFechas,
  type FechaCivil,
  sumarDias,
} from './fecha-civil';

/**
 * Urgencia por anticipación (PRD §6, Lectura B acordada en la Fase 3).
 *
 * El Staff necesita 5 días hábiles COMPLETOS entre la radicación y la reserva.
 * El día de la radicación nunca cuenta (no está completo), así que la reserva
 * deja de ser urgente a partir del 6.º día hábil posterior a la radicación.
 *
 * Es código puro: trabaja con fechas civiles, sin horas ni zona horaria.
 */
export const DIAS_HABILES_DE_ANTICIPACION = 5;

/**
 * Decisión D-S: tope de búsqueda. Con un calendario que nunca devuelve un día
 * hábil, el ciclo no terminaría y bloquearía el event loop de Node (el
 * servidor completo, no solo una petición). Un año entero es una cota holgada.
 */
export const MAXIMO_DIAS_DE_BUSQUEDA = 366;

/** El n-ésimo día hábil ESTRICTAMENTE posterior a `desde` (n ≥ 1). */
export function sumarDiasHabiles(
  desde: FechaCivil,
  n: number,
  calendario: CalendarioLaboral,
): FechaCivil {
  asegurarFechaCivilValida(desde);
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError('La cantidad de días hábiles debe ser un entero ≥ 1.');
  }

  let fecha = desde;
  let encontrados = 0;
  for (let paso = 1; paso <= MAXIMO_DIAS_DE_BUSQUEDA; paso++) {
    fecha = sumarDias(fecha, 1);
    if (calendario.esDiaHabil(fecha)) {
      encontrados++;
      if (encontrados === n) {
        return fecha;
      }
    }
  }
  throw new RangeError(
    `No se encontraron ${n} días hábiles en los ${MAXIMO_DIAS_DE_BUSQUEDA} días siguientes.`,
  );
}

/** Primera fecha de reserva que NO es urgente para una radicación dada. */
export function fechaMinimaSinUrgencia(
  radicacion: FechaCivil,
  calendario: CalendarioLaboral,
): FechaCivil {
  return sumarDiasHabiles(
    radicacion,
    DIAS_HABILES_DE_ANTICIPACION + 1,
    calendario,
  );
}

export function esUrgente(
  fechaReserva: FechaCivil,
  fechaMinima: FechaCivil,
): boolean {
  return compararFechas(fechaReserva, fechaMinima) < 0;
}
