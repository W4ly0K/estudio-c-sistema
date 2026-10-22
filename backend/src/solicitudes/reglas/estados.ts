import type { Estado } from './maquina-estados';

/**
 * Estados que LIBERAN la franja: una solicitud en ellos no cuenta para CA-06.
 *
 * Debe coincidir EXACTAMENTE con el WHERE de las DOS restricciones de exclusión por
 * sub-espacio (migración 20261023120000_ca06_subespacios, Fase 7 · ADR-007 SE2 y NA1).
 * Las migraciones aplicadas no se editan (su checksum está registrado): si esta lista
 * cambia, hace falta una migración NUEVA que recree las dos restricciones.
 * estados.spec.ts lee el SQL y falla si alguna lista diverge.
 * "No atendida" (T10) libera la franja igual que los otros dos finales que no llegaron
 * a ejecutarse; "Entregado" no, porque sí ocurrió.
 * `satisfies`: solo admite nombres de la máquina de estados (maquina-estados.ts),
 * y maquina-estados.spec.ts exige que todos sean estados finales.
 */
export const ESTADOS_QUE_LIBERAN_FRANJA = [
  'Rechazado',
  'Cancelado por el Usuario',
  'No atendida',
] as const satisfies readonly Estado[];

/**
 * ¿Una solicitud en este estado ocupa su franja horaria (cuenta para CA-06)?
 * Fail-closed: un estado desconocido SÍ la ocupa, igual que en el motor, donde
 * cualquier valor fuera del NOT IN cuenta como activo.
 */
export function ocupaFranja(estado: string): boolean {
  return !(ESTADOS_QUE_LIBERAN_FRANJA as readonly string[]).includes(estado);
}
