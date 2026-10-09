import { RolUsuario } from '@prisma/client';

/**
 * Máquina de estados de una solicitud (PRD v2.1 §5.5 y §8, diagrama
 * "Modelado de la Máquina de Estados", ADR-005).
 *
 * Módulo puro: no conoce HTTP, Nest ni la base de datos. Decide SI una
 * transición es legal y QUIÉN puede ejecutarla; los efectos (fechas, logs,
 * compare-and-set) y la traducción a códigos HTTP viven en el servicio.
 *
 * Una sola tabla (TRANSICIONES) responde las dos preguntas del sistema:
 *  - evaluarTransicion: "¿puedo ir de A a B?" (PATCH del tablero del Staff).
 *  - evaluarAccion: "¿puedo ejecutar esta acción desde A?" (endpoints de comando).
 */

export const ESTADOS = Object.freeze([
  'Recibido',
  'Validado',
  'En Producción',
  'Entregado',
  'Rechazado',
  'Cancelado por el Usuario',
  'Pendiente de Reprogramación',
] as const);

export type Estado = (typeof ESTADOS)[number];

/** Estado con el que nace toda solicitud (transición inicial del diagrama). */
export const ESTADO_INICIAL: Estado = 'Recibido';

export const ACCIONES = Object.freeze([
  'APROBAR',
  'RECHAZAR',
  'CANCELAR',
  'INICIAR_PRODUCCION',
  'FINALIZAR',
  'PROPONER_REPROGRAMACION',
  'ACEPTAR_REPROGRAMACION',
  'RECHAZAR_REPROGRAMACION',
] as const);

export type Accion = (typeof ACCIONES)[number];

export type IdTransicion = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9';

export interface Transicion {
  /** Identificador trazable al diagrama y al ADR-005. */
  readonly id: IdTransicion;
  readonly accion: Accion;
  readonly origen: Estado;
  readonly destino: Estado;
  /** Único rol autorizado: ninguna transición es compartida (PRD §5.5). */
  readonly rol: RolUsuario;
}

const { STAFF, SOLICITANTE } = RolUsuario;

/**
 * Las 9 transiciones legales. Cualquier par (origen, destino) ausente está
 * prohibido. Rechazado y Cancelado por el Usuario son finales absolutos: no
 * existe la reactivación (Decisión D1).
 */
export const TRANSICIONES: readonly Transicion[] = Object.freeze(
  (
    [
      { id: 'T1', accion: 'APROBAR', origen: 'Recibido', destino: 'Validado', rol: STAFF },
      { id: 'T2', accion: 'RECHAZAR', origen: 'Recibido', destino: 'Rechazado', rol: STAFF },
      { id: 'T3', accion: 'CANCELAR', origen: 'Recibido', destino: 'Cancelado por el Usuario', rol: SOLICITANTE },
      { id: 'T4', accion: 'INICIAR_PRODUCCION', origen: 'Validado', destino: 'En Producción', rol: STAFF },
      { id: 'T5', accion: 'PROPONER_REPROGRAMACION', origen: 'Validado', destino: 'Pendiente de Reprogramación', rol: STAFF },
      { id: 'T6', accion: 'CANCELAR', origen: 'Validado', destino: 'Cancelado por el Usuario', rol: SOLICITANTE },
      { id: 'T7', accion: 'ACEPTAR_REPROGRAMACION', origen: 'Pendiente de Reprogramación', destino: 'Validado', rol: SOLICITANTE },
      { id: 'T8', accion: 'RECHAZAR_REPROGRAMACION', origen: 'Pendiente de Reprogramación', destino: 'Cancelado por el Usuario', rol: SOLICITANTE },
      { id: 'T9', accion: 'FINALIZAR', origen: 'En Producción', destino: 'Entregado', rol: STAFF },
    ] satisfies Transicion[]
  ).map((t) => Object.freeze(t)),
);

/**
 * Finales: estados sin transiciones de salida. Se DERIVAN de la tabla para que
 * no puedan contradecirla; la prueba fija la lista esperada por separado.
 */
export const ESTADOS_FINALES: readonly Estado[] = Object.freeze(
  ESTADOS.filter((estado) => !TRANSICIONES.some((t) => t.origen === estado)),
);

export type MotivoTransicionInvalida =
  | 'ESTADO_DESCONOCIDO'
  | 'MISMO_ESTADO'
  | 'ESTADO_FINAL'
  | 'TRANSICION_NO_DEFINIDA'
  | 'ROL_NO_AUTORIZADO';

export type ResultadoTransicion =
  | { readonly permitida: true; readonly transicion: Transicion }
  | { readonly permitida: false; readonly motivo: MotivoTransicionInvalida };

/**
 * Guarda de tipo. Los estados llegan como `string` desde la base de datos
 * (columna sin enum, con al menos un dato heredado fuera del diagrama): la
 * validación se hace aquí, nunca confiando en el tipo. Comparación exacta:
 * mayúsculas, tildes y espacios cuentan.
 */
export function esEstado(valor: string): valor is Estado {
  return (ESTADOS as readonly string[]).includes(valor);
}

export function esEstadoFinal(estado: Estado): boolean {
  return ESTADOS_FINALES.includes(estado);
}

function negar(motivo: MotivoTransicionInvalida): ResultadoTransicion {
  return { permitida: false, motivo };
}

/**
 * Elige, entre las transiciones candidatas, la del rol que actúa.
 * Fail-closed: sin candidatas → no definida; con candidatas de otro rol → rol no autorizado.
 */
function resolverPorRol(candidatas: readonly Transicion[], rol: RolUsuario): ResultadoTransicion {
  if (candidatas.length === 0) {
    return negar('TRANSICION_NO_DEFINIDA');
  }
  const transicion = candidatas.find((t) => t.rol === rol);
  return transicion ? { permitida: true, transicion } : negar('ROL_NO_AUTORIZADO');
}

/** ¿Puede `rol` mover una solicitud de `origen` a `destino`? */
export function evaluarTransicion(origen: string, destino: string, rol: RolUsuario): ResultadoTransicion {
  if (!esEstado(origen) || !esEstado(destino)) {
    return negar('ESTADO_DESCONOCIDO');
  }
  if (origen === destino) {
    return negar('MISMO_ESTADO');
  }
  if (esEstadoFinal(origen)) {
    return negar('ESTADO_FINAL');
  }
  return resolverPorRol(
    TRANSICIONES.filter((t) => t.origen === origen && t.destino === destino),
    rol,
  );
}

/** ¿Puede `rol` ejecutar `accion` sobre una solicitud que está en `origen`? */
export function evaluarAccion(accion: Accion, origen: string, rol: RolUsuario): ResultadoTransicion {
  if (!esEstado(origen)) {
    return negar('ESTADO_DESCONOCIDO');
  }
  if (esEstadoFinal(origen)) {
    return negar('ESTADO_FINAL');
  }
  return resolverPorRol(
    TRANSICIONES.filter((t) => t.accion === accion && t.origen === origen),
    rol,
  );
}
