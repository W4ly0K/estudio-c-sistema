import type { CategoriaSolicitud, Prisma } from '@prisma/client';
import { CATEGORIAS_CON_EDICION } from './categorias';
import type { Estado } from './maquina-estados';

/**
 * Estados que LIBERAN la franja en TODAS las categorías: una solicitud en ellos no cuenta para
 * CA-06. Debe coincidir EXACTAMENTE con el NOT IN de las DOS restricciones de exclusión por
 * sub-espacio (migración vigente: 20261028120000_ca06_edicion_postproduccion, que recrea las de
 * la Fase 7). Las migraciones aplicadas no se editan: si esta lista cambia, hace falta una
 * migración NUEVA. estados.spec.ts lee ese SQL y falla si la regla diverge.
 * "No atendida" (T10) libera igual que los otros finales que no llegaron a ejecutarse.
 * Fase 8: "Edición y postproducción" libera al entrar (T11) aunque NO es final: su única salida
 * (T12) lleva a un estado que, para esas categorías, tampoco ocupa (abajo). La regla que
 * importa ya no es "solo los finales liberan", sino "liberar es irreversible":
 * maquina-estados.spec.ts la verifica para cada categoría.
 */
export const ESTADOS_QUE_LIBERAN_FRANJA = [
  'Rechazado',
  'Cancelado por el Usuario',
  'No atendida',
  'Edición y postproducción',
] as const satisfies readonly Estado[];

/**
 * Fase 8 · Opción A de H1 (aprobada el 2026-10-28): un "Entregado" de las categorías que pasan
 * por edición NO ocupa: ya liberó la franja en T11, y volver a ocuparla en T12 haría fallar la
 * entrega con 23P01 si otra reserva tomó ese tiempo. En las demás categorías sigue ocupando.
 */
export const ESTADO_QUE_LIBERA_SEGUN_CATEGORIA = 'Entregado' satisfies Estado;

/**
 * ¿Una solicitud en este estado y de esta categoría ocupa su franja (cuenta para CA-06)?
 * Fail-closed: un estado desconocido SÍ la ocupa, igual que en el motor, donde cualquier
 * valor fuera del NOT IN cuenta como activo.
 */
export function ocupaFranja(estado: string, categoria: CategoriaSolicitud): boolean {
  if ((ESTADOS_QUE_LIBERAN_FRANJA as readonly string[]).includes(estado)) return false;
  return !(estado === ESTADO_QUE_LIBERA_SEGUN_CATEGORIA && CATEGORIAS_CON_EDICION.includes(categoria));
}

/**
 * La MISMA regla como filtro de Prisma para la consulta previa de CA-06 (hayTraslape). El OR es
 * la forma positiva de "NOT (Entregado AND categoría con edición)", que es como lo dice el SQL.
 */
export const FILTRO_OCUPA_FRANJA = {
  estado: { notIn: [...ESTADOS_QUE_LIBERAN_FRANJA] },
  OR: [{ estado: { not: ESTADO_QUE_LIBERA_SEGUN_CATEGORIA } }, { categoria: { notIn: [...CATEGORIAS_CON_EDICION] } }],
} satisfies Prisma.SolicitudWhereInput;
