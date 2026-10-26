import { SubEspacio } from '@prisma/client';

/**
 * Sub-espacios del Estudio C (PRD v2.2 §5.1, ADR-007 SE1, SE2 y SE4). Módulo puro: no
 * conoce HTTP, Nest ni la base de datos.
 *
 * La regla de CA-06 existe dos veces, igual que los estados que liberan la franja
 * (Decisión AH de ADR-004): aquí, para la consulta previa (capa amable), y en los
 * predicados de las dos restricciones de exclusión del motor (migración
 * 20261023120000_ca06_subespacios). sub-espacios.spec.ts lee ese SQL y falla si las dos
 * versiones de la regla divergen.
 */

/** Las tres opciones de reserva, en el orden del enum de Prisma. */
export const SUB_ESPACIOS = Object.freeze([
  SubEspacio.CABINA_AUDIO,
  SubEspacio.ESTUDIO_GRABACION,
  SubEspacio.ESTUDIO_COMPLETO,
] as const);

/**
 * Expand (ADR-007, 7A.3 → 7A.8): lo que se reserva cuando la petición no trae sub-espacio.
 * Espejo del DEFAULT temporal de la columna: el completo bloquea los dos, igual que el
 * calendario único de antes de la v2.2. Se retira en el contract, cuando sea obligatorio.
 */
export const SUB_ESPACIO_POR_DEFECTO_TEMPORAL: SubEspacio = SubEspacio.ESTUDIO_COMPLETO;

/** Los sub-espacios que existen físicamente; el completo es la unión de los dos. */
export type SubEspacioFisico = typeof SubEspacio.CABINA_AUDIO | typeof SubEspacio.ESTUDIO_GRABACION;

/**
 * La restricción de exclusión que protege cada sub-espacio físico (SE2). Los nombres
 * son los de la lista cerrada del detector (RESTRICCIONES_CA06_POR_SUBESPACIO).
 */
export const RESTRICCION_DEL_SUBESPACIO: Readonly<Record<SubEspacioFisico, string>> = Object.freeze({
  CABINA_AUDIO: 'Solicitud_sin_traslape_ca06_cabina',
  ESTUDIO_GRABACION: 'Solicitud_sin_traslape_ca06_estudio',
});

/**
 * Qué sub-espacios físicos ocupa cada opción de reserva. `Record` sobre el enum: un
 * sub-espacio nuevo en schema.prisma no compila hasta decidir qué ocupa.
 */
export const OCUPA: Readonly<Record<SubEspacio, readonly SubEspacioFisico[]>> = Object.freeze({
  CABINA_AUDIO: Object.freeze([SubEspacio.CABINA_AUDIO] as const),
  ESTUDIO_GRABACION: Object.freeze([SubEspacio.ESTUDIO_GRABACION] as const),
  ESTUDIO_COMPLETO: Object.freeze([SubEspacio.CABINA_AUDIO, SubEspacio.ESTUDIO_GRABACION] as const),
});

/**
 * Las opciones de reserva que chocan con `subEspacio` si sus franjas se traslapan (CA-06
 * por sub-espacio): las que ocupan al menos un sub-espacio físico en común. Es la tabla
 * del PRD v2.2 §5.1. La usa hayTraslape(), la capa amable de CA-06 (paso 7A.4).
 */
export function subEspaciosEnConflicto(subEspacio: SubEspacio): readonly SubEspacio[] {
  const propios = OCUPA[subEspacio];
  return SUB_ESPACIOS.filter((otro) => OCUPA[otro].some((fisico) => propios.includes(fisico)));
}
