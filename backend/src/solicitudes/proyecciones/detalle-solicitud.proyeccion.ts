import { Prisma } from '@prisma/client';

/*
 * Proyecciones por rol (Decisión I · ADR-002).
 * Se usa `select` (lista blanca) y no `include`: una columna nueva en el schema
 * NO se expone en la API hasta que alguien la agregue aquí a propósito.
 */

/** Vista completa para el Staff (gestión y auditoría). */
export const SELECT_DETALLE_STAFF = Prisma.validator<Prisma.SolicitudSelect>()({
  radicado: true,
  id_usuario: true,
  categoria: true,
  proposito: true,
  num_participantes: true,
  fecha_inicio: true,
  fecha_fin: true,
  fecha_propuesta_inicio: true,
  fecha_propuesta_fin: true,
  estado: true,
  es_urgencia: true,
  // Fase 7 · PRD v2.2 §5.1: dónde ocurre la reserva y, en una propuesta (CA-10), dónde ocurriría.
  sub_espacio: true,
  sub_espacio_propuesto: true,
  usuario: { select: { id_usuario: true, nombre: true, correo: true, rol: true } },
  recursos: {
    select: {
      id_detalle: true,
      cantidad_solicitada: true,
      recurso: { select: { id_recurso: true, nombre: true, cantidad_total: true } },
    },
  },
  logs: {
    orderBy: { fecha_modificacion: 'asc' },
    select: {
      id_log: true,
      estado_anterior: true,
      estado_nuevo: true,
      modificado_por: true,
      fecha_modificacion: true,
      motivo_rechazo: true,
      motivo_reprogramacion: true,
    },
  },
});

/** Vista mínima para el dueño (pantalla B3): sin identidades internas ni inventario. */
export const SELECT_DETALLE_SOLICITANTE = Prisma.validator<Prisma.SolicitudSelect>()({
  radicado: true,
  categoria: true,
  proposito: true,
  num_participantes: true,
  fecha_inicio: true,
  fecha_fin: true,
  fecha_propuesta_inicio: true,
  fecha_propuesta_fin: true,
  estado: true,
  es_urgencia: true,
  // Fase 7 · B3/B4: el solicitante ve su sub-espacio y, para decidir T7/T8, el propuesto.
  sub_espacio: true,
  sub_espacio_propuesto: true,
  recursos: {
    select: { cantidad_solicitada: true, recurso: { select: { nombre: true } } },
  },
  logs: {
    orderBy: { fecha_modificacion: 'asc' },
    select: {
      estado_anterior: true,
      estado_nuevo: true,
      fecha_modificacion: true,
      motivo_rechazo: true,
      // B4: el solicitante ve por qué el Estudio C le propone otra fecha (Fase 6.1b).
      motivo_reprogramacion: true,
    },
  },
});

export type DetalleSolicitudStaff = Prisma.SolicitudGetPayload<{
  select: typeof SELECT_DETALLE_STAFF;
}>;
export type DetalleSolicitudSolicitante = Prisma.SolicitudGetPayload<{
  select: typeof SELECT_DETALLE_SOLICITANTE;
}>;
export type DetalleSolicitud = DetalleSolicitudStaff | DetalleSolicitudSolicitante;
