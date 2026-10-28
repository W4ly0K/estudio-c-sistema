import { CategoriaSolicitud } from '@prisma/client';
import type { IdTransicion } from './maquina-estados';

/**
 * Fase 8 · Fuente única de las reglas que dependen de la CATEGORÍA de una solicitud
 * (directrices del tutor del 2026-10-26 y ADR-007 SE10). Módulo puro: no conoce HTTP, Nest
 * ni la base de datos.
 *
 * La categoría no cambia después de radicar (Fase 8 · H2): por eso puede gobernar el lugar,
 * el camino de estados y la entrega de una solicitud.
 */

/**
 * ADR-007 SE10 (directriz del 26/10/2026): la única categoría en la que el solicitante ELIGE el
 * sub-espacio al radicar es la solicitud de espacio físico. Se declara como literal, no se
 * deriva de la tabla: el frontend la usa como discriminante de una unión y su prueba de
 * contrato (contrato.test.ts) lee esta línea textual.
 */
export const CATEGORIA_QUE_ELIGE_SUB_ESPACIO = CategoriaSolicitud.ESPACIOS;

/** Requisito 4: qué exige el paso a "Entregado" respecto del enlace del producto final. */
export type EnlaceAlEntregar = 'OBLIGATORIO' | 'PROHIBIDO';

export interface PoliticaCategoria {
  /** Requisito 3: pasa por "Edición y postproducción" entre la producción y la entrega. */
  readonly pasaPorEdicion: boolean;
  /** Requisito 4: OBLIGATORIO exige un https:// válido; PROHIBIDO responde 400 si llega. */
  readonly enlaceAlEntregar: EnlaceAlEntregar;
}

/**
 * La tabla. `Record` sobre el enum de Prisma: una categoría nueva en schema.prisma no compila
 * hasta decidir su política. Desde el paso 8.5 la consumen la máquina de estados, el servicio
 * y la migración (su prueba de alineación compara el SQL con las listas derivadas de abajo).
 */
export const POLITICA_POR_CATEGORIA: Readonly<Record<CategoriaSolicitud, PoliticaCategoria>> = Object.freeze({
  PODCAST: Object.freeze({ pasaPorEdicion: true, enlaceAlEntregar: 'OBLIGATORIO' }),
  VIDEO: Object.freeze({ pasaPorEdicion: true, enlaceAlEntregar: 'OBLIGATORIO' }),
  ESPACIOS: Object.freeze({ pasaPorEdicion: false, enlaceAlEntregar: 'PROHIBIDO' }),
  STREAMING: Object.freeze({ pasaPorEdicion: false, enlaceAlEntregar: 'OBLIGATORIO' }),
  ASESORIAS: Object.freeze({ pasaPorEdicion: false, enlaceAlEntregar: 'PROHIBIDO' }),
});

const CATEGORIAS: readonly CategoriaSolicitud[] = Object.values(CategoriaSolicitud);

/** Derivada de la tabla: las categorías que pasan por edición, en el orden del enum. */
export const CATEGORIAS_CON_EDICION: readonly CategoriaSolicitud[] = Object.freeze(
  CATEGORIAS.filter((categoria) => POLITICA_POR_CATEGORIA[categoria].pasaPorEdicion),
);

/** Derivada de la tabla: las categorías cuya entrega exige el enlace, en el orden del enum. */
export const CATEGORIAS_CON_ENLACE: readonly CategoriaSolicitud[] = Object.freeze(
  CATEGORIAS.filter((categoria) => POLITICA_POR_CATEGORIA[categoria].enlaceAlEntregar === 'OBLIGATORIO'),
);

/**
 * Fase 8 · requisito 3: la máquina de estados dice si un paso EXISTE; la categoría, si le
 * APLICA. T9 (entrega directa) es solo de las categorías sin edición; T11 y T12, solo de las
 * que pasan por ella. Las demás transiciones aplican a todas.
 */
export const TRANSICIONES_SIN_EDICION: readonly IdTransicion[] = Object.freeze(['T9']);
export const TRANSICIONES_CON_EDICION: readonly IdTransicion[] = Object.freeze(['T11', 'T12']);

export function transicionAplicaALaCategoria(id: IdTransicion, categoria: CategoriaSolicitud): boolean {
  const { pasaPorEdicion } = POLITICA_POR_CATEGORIA[categoria];
  if (TRANSICIONES_CON_EDICION.includes(id)) return pasaPorEdicion;
  if (TRANSICIONES_SIN_EDICION.includes(id)) return !pasaPorEdicion;
  return true;
}
