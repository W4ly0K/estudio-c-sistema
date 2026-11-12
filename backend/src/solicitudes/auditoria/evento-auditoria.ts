import { CampoEnlace, type Prisma } from '@prisma/client';
import type { Estado } from '../reglas/maquina-estados';

/*
 * Fase 9 · ADR-012 EV6: los eventos que escribe Log_Auditoria, como unión discriminada por `tipo`.
 *  - TRANSICION: un cambio de estado de T1 a T12 (ADR-005). Sus datos son exactamente los de siempre.
 *  - ENLACE_ANEXO y ENLACE_ENTREGA: eventos sin cambio de estado (ADR-012 EV1; B1 a B9 de la migración
 *    20261109110000_enlace_anexo). Todavía no los escribe ningún servicio: los usarán la edición del
 *    anexo (ADR-009 §2.7) y la corrección del enlace de entrega (ADR-008 §2.7).
 * El tipo impide en compilación mezclar campos de un evento con los de otro; el motor sigue siendo la
 * última barrera (B1 a B9).
 */

/** Las cuatro columnas de ADR-012 EV2: solo existen en los eventos de enlace. */
type ColumnaDeEnlace = 'enlace_campo' | 'enlace_anterior' | 'enlace_nuevo' | 'motivo_correccion';

/** Lo que fija esta función en un evento de enlace: quien llama no lo elige (B3 y B4). */
type ColumnaFijadaEnEnlace = 'estado_anterior' | 'estado_nuevo' | 'enlace_campo';

/**
 * Prohíbe propiedades también cuando el objeto no es un literal: la comprobación de propiedades de más
 * de TypeScript solo aplica a literales.
 */
type Sin<K extends PropertyKey> = { [P in K]?: never };

/** Los campos de una transición: los del log de siempre, sin las columnas de enlace. */
export type CamposDeTransicion = Omit<Prisma.Log_AuditoriaUncheckedCreateInput, 'radicado_solicitud' | ColumnaDeEnlace> &
  Sin<ColumnaDeEnlace>;

export interface EventoTransicion {
  tipo: 'TRANSICION';
  log: CamposDeTransicion;
}

/** Cambio o retiro del anexo (ADR-009 AN10 a AN12): `null` = no había anexo, o se retira (D1). */
export type EventoEnlaceAnexo = {
  tipo: 'ENLACE_ANEXO';
  modificado_por: string;
  enlace_anterior: string | null;
  enlace_nuevo: string | null;
} & Sin<ColumnaFijadaEnEnlace | 'motivo_correccion'>;

/** Corrección del enlace de entrega (ADR-008 EN6 a EN12). */
export type EventoEnlaceEntrega = {
  tipo: 'ENLACE_ENTREGA';
  modificado_por: string;
  /** D2: no se corrige una entrega que nunca tuvo enlace. */
  enlace_anterior: string;
  /** B4: el enlace de entrega no se retira. */
  enlace_nuevo: string;
  /** D8: opcional; si viene, ya recortado y validado por el DTO (B9). */
  motivo_correccion?: string;
} & Sin<ColumnaFijadaEnEnlace>;

export type EventoAuditoria = EventoTransicion | EventoEnlaceAnexo | EventoEnlaceEntrega;

/** B4: el estado, igual antes y después (B3), en que existe cada evento de enlace. */
export const ESTADO_DEL_EVENTO_DE_ENLACE = {
  ANEXO: 'Recibido',
  ENTREGA: 'Entregado',
} as const satisfies Record<CampoEnlace, Estado>;

/** Los datos de Log_Auditoria para un evento, en la misma transacción que el cambio (ADR-012 EV5). */
export function datosDelLog(radicado: string, evento: EventoAuditoria): Prisma.Log_AuditoriaUncheckedCreateInput {
  switch (evento.tipo) {
    case 'TRANSICION':
      // Exactamente el objeto de antes de EV6: el radicado y los campos del log, sin agregar nada.
      return { radicado_solicitud: radicado, ...evento.log };
    case 'ENLACE_ANEXO':
      return {
        radicado_solicitud: radicado,
        estado_anterior: ESTADO_DEL_EVENTO_DE_ENLACE.ANEXO,
        estado_nuevo: ESTADO_DEL_EVENTO_DE_ENLACE.ANEXO,
        modificado_por: evento.modificado_por,
        enlace_campo: CampoEnlace.ANEXO,
        enlace_anterior: evento.enlace_anterior,
        enlace_nuevo: evento.enlace_nuevo,
      };
    case 'ENLACE_ENTREGA':
      return {
        radicado_solicitud: radicado,
        estado_anterior: ESTADO_DEL_EVENTO_DE_ENLACE.ENTREGA,
        estado_nuevo: ESTADO_DEL_EVENTO_DE_ENLACE.ENTREGA,
        modificado_por: evento.modificado_por,
        enlace_campo: CampoEnlace.ENTREGA,
        enlace_anterior: evento.enlace_anterior,
        enlace_nuevo: evento.enlace_nuevo,
        // Sin motivo, la clave no viaja (D8).
        ...(evento.motivo_correccion === undefined ? {} : { motivo_correccion: evento.motivo_correccion }),
      };
    default: {
      // Fail-closed: un tipo nuevo sin datos rompe la compilación aquí (never) y, si llegara uno
      // inesperado en ejecución, se lanza un error en vez de escribir un log incompleto.
      const eventoSinDatos: never = evento;
      throw new Error(`Evento de auditoría sin datos definidos: ${String((eventoSinDatos as { tipo?: unknown }).tipo)}`);
    }
  }
}
