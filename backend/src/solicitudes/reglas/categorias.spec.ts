import { CategoriaSolicitud } from '@prisma/client';
import {
  CATEGORIA_QUE_ELIGE_SUB_ESPACIO,
  CATEGORIAS_CON_EDICION,
  CATEGORIAS_CON_ENLACE,
  POLITICA_POR_CATEGORIA,
  type PoliticaCategoria,
} from './categorias';

/**
 * ORÁCULO: transcripción a mano de las directrices del tutor (requisitos 3 y 4) y de ADR-007
 * SE10. Se compara contra ella, nunca contra la tabla consigo misma (sería una tautología).
 */
const ORACULO: Readonly<Record<CategoriaSolicitud, PoliticaCategoria & { readonly eligeSubEspacio: boolean }>> = {
  PODCAST: { eligeSubEspacio: false, pasaPorEdicion: true, enlaceAlEntregar: 'OBLIGATORIO' },
  VIDEO: { eligeSubEspacio: false, pasaPorEdicion: true, enlaceAlEntregar: 'OBLIGATORIO' },
  ESPACIOS: { eligeSubEspacio: true, pasaPorEdicion: false, enlaceAlEntregar: 'PROHIBIDO' },
  STREAMING: { eligeSubEspacio: false, pasaPorEdicion: false, enlaceAlEntregar: 'OBLIGATORIO' },
  ASESORIAS: { eligeSubEspacio: false, pasaPorEdicion: false, enlaceAlEntregar: 'PROHIBIDO' },
};

const CATEGORIAS = Object.values(CategoriaSolicitud);

describe('Política por categoría (Fase 8 · 8.1)', () => {
  it('la tabla tiene exactamente las categorías del enum de Prisma, en su orden', () => {
    expect(Object.keys(POLITICA_POR_CATEGORIA)).toEqual(CATEGORIAS);
  });

  it.each(CATEGORIAS)('%s coincide con las directrices (edición, enlace y sub-espacio)', (categoria) => {
    const { eligeSubEspacio, ...politica } = ORACULO[categoria];
    expect(POLITICA_POR_CATEGORIA[categoria]).toEqual(politica);
    expect(categoria === CATEGORIA_QUE_ELIGE_SUB_ESPACIO).toBe(eligeSubEspacio);
  });

  it('las listas derivadas: edición en PODCAST y VIDEO; enlace en PODCAST, VIDEO y STREAMING', () => {
    expect(CATEGORIAS_CON_EDICION).toEqual([CategoriaSolicitud.PODCAST, CategoriaSolicitud.VIDEO]);
    expect(CATEGORIAS_CON_ENLACE).toEqual([
      CategoriaSolicitud.PODCAST,
      CategoriaSolicitud.VIDEO,
      CategoriaSolicitud.STREAMING,
    ]);
  });

  it('invariante de negocio: toda categoría que pasa por edición exige el enlace del producto final', () => {
    for (const categoria of CATEGORIAS_CON_EDICION) {
      expect(CATEGORIAS_CON_ENLACE).toContain(categoria);
    }
  });

  it('la tabla, sus filas y las listas derivadas están congeladas', () => {
    expect(Object.isFrozen(POLITICA_POR_CATEGORIA)).toBe(true);
    for (const categoria of CATEGORIAS) {
      expect(Object.isFrozen(POLITICA_POR_CATEGORIA[categoria])).toBe(true);
    }
    expect(Object.isFrozen(CATEGORIAS_CON_EDICION)).toBe(true);
    expect(Object.isFrozen(CATEGORIAS_CON_ENLACE)).toBe(true);
  });
});
