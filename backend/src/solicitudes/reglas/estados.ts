/**
 * Estados que LIBERAN la franja: una solicitud en ellos no cuenta para CA-06.
 *
 * Debe coincidir EXACTAMENTE con el WHERE de la restricción de exclusión
 * "Solicitud_sin_traslape_ca06" (migración 20261002200000_ca06_sin_traslape).
 * Esa migración ya está aplicada y no se edita (su checksum está registrado):
 * si esta lista cambia, hace falta una migración NUEVA que recree la
 * restricción. estados.spec.ts lee el SQL y falla si ambas listas divergen.
 */
export const ESTADOS_QUE_LIBERAN_FRANJA = ['Rechazado', 'Cancelado por el Usuario'] as const;

/**
 * ¿Una solicitud en este estado ocupa su franja horaria (cuenta para CA-06)?
 * Fail-closed: un estado desconocido SÍ la ocupa, igual que en el motor, donde
 * cualquier valor fuera del NOT IN cuenta como activo.
 */
export function ocupaFranja(estado: string): boolean {
  return !(ESTADOS_QUE_LIBERAN_FRANJA as readonly string[]).includes(estado);
}
