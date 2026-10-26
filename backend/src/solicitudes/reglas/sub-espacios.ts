import { CategoriaSolicitud, SubEspacio } from '@prisma/client';

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
 * Fase 7 · 7B.4 (ADR-007 SE10, directriz del 26/10/2026): la única categoría en la que el
 * solicitante ELIGE el sub-espacio al radicar es la solicitud de espacio físico.
 */
export const CATEGORIA_QUE_ELIGE_SUB_ESPACIO = CategoriaSolicitud.ESPACIOS;

/**
 * SE10: lo que reservan las demás categorías (servicios) al radicar. Es una REGLA de negocio,
 * no un valor por defecto: el completo protege los dos sub-espacios hasta que el Staff ajuste
 * el lugar al validar (D-4, «Validar con ajustes»). Desde el contract (7A.8) la columna no
 * tiene DEFAULT: el servicio escribe siempre este valor de forma explícita.
 */
export const SUB_ESPACIO_DE_SERVICIOS: SubEspacio = SubEspacio.ESTUDIO_COMPLETO;

/** Por qué no se puede radicar con lo recibido. Los mensajes viven en la capa HTTP. */
export type ErrorSubEspacioAlRadicar = 'REQUERIDO_EN_ESPACIOS' | 'SOLO_EN_ESPACIOS';

export type ResultadoSubEspacioAlRadicar =
  | { readonly ok: true; readonly subEspacio: SubEspacio }
  | { readonly ok: false; readonly error: ErrorSubEspacioAlRadicar };

/**
 * SE10: el sub-espacio que se guarda al radicar, según la categoría.
 *  - Espacio físico: el que eligió el solicitante, obligatorio.
 *  - Servicios: el completo; enviar uno es un error (no se ignora en silencio: el cliente
 *    creería que eligió algo), con el mismo criterio de E5 y D-4.
 */
export function subEspacioAlRadicar(
  categoria: CategoriaSolicitud,
  enviado: SubEspacio | undefined,
): ResultadoSubEspacioAlRadicar {
  if (categoria === CATEGORIA_QUE_ELIGE_SUB_ESPACIO) {
    return enviado === undefined ? { ok: false, error: 'REQUERIDO_EN_ESPACIOS' } : { ok: true, subEspacio: enviado };
  }
  return enviado === undefined ? { ok: true, subEspacio: SUB_ESPACIO_DE_SERVICIOS } : { ok: false, error: 'SOLO_EN_ESPACIOS' };
}

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
