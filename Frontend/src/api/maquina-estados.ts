/**
 * Copia, SOLO PARA LA VISTA, de la máquina de estados del backend
 * (backend/src/solicitudes/reglas/maquina-estados.ts · ADR-005).
 *
 * Principio de la Fase 6: el frontend refleja, el backend decide. Esta tabla solo
 * sirve para mostrar los botones que tienen sentido; la legalidad la decide el
 * servidor y sus 403/409 se muestran tal cual. contrato.test.ts compara esta copia
 * con la del backend y falla en el CI si divergen (Decisión DC4).
 */

export const ESTADOS = [
  'Recibido',
  'Validado',
  'En Producción',
  'Entregado',
  'Rechazado',
  'Cancelado por el Usuario',
  'Pendiente de Reprogramación',
  // Fase 7 · PRD v2.2 §8.2: cierre del Staff para una solicitud vencida que no se atendió.
  'No atendida',
] as const;
export type Estado = (typeof ESTADOS)[number];

export const ESTADO_INICIAL: Estado = 'Recibido';

/** Mismo orden que el enum RolUsuario de Prisma. */
export const ROLES = ['SOLICITANTE', 'STAFF'] as const;
export type Rol = (typeof ROLES)[number];

export const ACCIONES = [
  'APROBAR',
  'RECHAZAR',
  'CANCELAR',
  'INICIAR_PRODUCCION',
  'FINALIZAR',
  'PROPONER_REPROGRAMACION',
  'ACEPTAR_REPROGRAMACION',
  'RECHAZAR_REPROGRAMACION',
  'CERRAR_NO_ATENDIDA',
] as const;
export type Accion = (typeof ACCIONES)[number];

export type IdTransicion = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9' | 'T10';

export interface Transicion {
  readonly id: IdTransicion;
  readonly accion: Accion;
  readonly origen: Estado;
  readonly destino: Estado;
  /** Único rol autorizado: ninguna transición es compartida (PRD §5.5). */
  readonly rol: Rol;
}

export const TRANSICIONES = [
  { id: 'T1', accion: 'APROBAR', origen: 'Recibido', destino: 'Validado', rol: 'STAFF' },
  { id: 'T2', accion: 'RECHAZAR', origen: 'Recibido', destino: 'Rechazado', rol: 'STAFF' },
  { id: 'T3', accion: 'CANCELAR', origen: 'Recibido', destino: 'Cancelado por el Usuario', rol: 'SOLICITANTE' },
  { id: 'T4', accion: 'INICIAR_PRODUCCION', origen: 'Validado', destino: 'En Producción', rol: 'STAFF' },
  { id: 'T5', accion: 'PROPONER_REPROGRAMACION', origen: 'Validado', destino: 'Pendiente de Reprogramación', rol: 'STAFF' },
  { id: 'T6', accion: 'CANCELAR', origen: 'Validado', destino: 'Cancelado por el Usuario', rol: 'SOLICITANTE' },
  { id: 'T7', accion: 'ACEPTAR_REPROGRAMACION', origen: 'Pendiente de Reprogramación', destino: 'Validado', rol: 'SOLICITANTE' },
  { id: 'T8', accion: 'RECHAZAR_REPROGRAMACION', origen: 'Pendiente de Reprogramación', destino: 'Cancelado por el Usuario', rol: 'SOLICITANTE' },
  { id: 'T9', accion: 'FINALIZAR', origen: 'En Producción', destino: 'Entregado', rol: 'STAFF' },
  { id: 'T10', accion: 'CERRAR_NO_ATENDIDA', origen: 'Recibido', destino: 'No atendida', rol: 'STAFF' },
] as const satisfies readonly Transicion[];

/** Estados sin transiciones de salida. Se DERIVAN de la tabla, igual que en el backend. */
export const ESTADOS_FINALES: readonly Estado[] = ESTADOS.filter(
  (estado) => !TRANSICIONES.some((t) => t.origen === estado),
);

export function esEstadoFinal(estado: Estado): boolean {
  return ESTADOS_FINALES.includes(estado);
}

/**
 * Las transiciones que la UI puede OFRECER a este rol en este estado (botones).
 * Mostrar un botón no lo autoriza: el servidor vuelve a decidir al recibir la acción.
 */
export function accionesDisponibles(estado: Estado, rol: Rol): readonly Transicion[] {
  return TRANSICIONES.filter((t) => t.origen === estado && t.rol === rol);
}
