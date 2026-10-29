import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CategoriaSolicitud } from '@prisma/client';
import { ENLACE_ENTREGA_MAXIMO } from '../dto/update-solicitude.dto';
import {
  CATEGORIA_QUE_ELIGE_SUB_ESPACIO,
  CATEGORIAS_CON_EDICION,
  CATEGORIAS_CON_ENLACE,
  POLITICA_POR_CATEGORIA,
  transicionAplicaALaCategoria,
  type PoliticaCategoria,
} from './categorias';
import { TRANSICIONES } from './maquina-estados';

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

describe('Enlace del producto final: la migración coincide con el código (Fase 8 · requisito 4)', () => {
  const sql = readFileSync(
    join(__dirname, '../../../prisma/migrations/20261028130000_enlace_entrega/migration.sql'),
    'utf8',
  ).replace(/--.*$/gm, '');
  const literales = (lista: string): string[] => [...lista.matchAll(/'([^']*)'/g)].map((m) => m[1]).sort();

  it('las dos restricciones que nombran categorías usan exactamente CATEGORIAS_CON_ENLACE', () => {
    const listas = [...sql.matchAll(/categoria (?:NOT )?IN \(([^)]*)\)/g)].map((m) => literales(m[1]));
    expect(listas).toHaveLength(2);
    for (const lista of listas) {
      expect(lista).toEqual([...CATEGORIAS_CON_ENLACE].sort());
    }
  });

  it('el límite del CHECK de formato es ENLACE_ENTREGA_MAXIMO del DTO', () => {
    expect(sql).toContain(`char_length(enlace_entrega) <= ${ENLACE_ENTREGA_MAXIMO}`);
  });

  it('solo la regla de "Entregado exige enlace" va NOT VALID (DT-3); las demás se validan', () => {
    expect([...sql.matchAll(/NOT VALID/g)]).toHaveLength(1);
    expect(sql).toMatch(/"Solicitud_entrega_con_enlace_check"[^;]*NOT VALID;/);
  });
});

describe('transicionAplicaALaCategoria (Fase 8 · requisito 3)', () => {
  const CON_REGLA_PROPIA = ['T9', 'T11', 'T12'];

  // ORÁCULO (directriz del tutor): con edición, T4 → T11 → T12; sin edición, T4 → T9.
  it.each(CATEGORIAS)('%s: T9 solo sin edición; T11 y T12 solo con edición; el resto, siempre', (categoria) => {
    const conEdicion = ORACULO[categoria].pasaPorEdicion;
    expect(transicionAplicaALaCategoria('T9', categoria)).toBe(!conEdicion);
    expect(transicionAplicaALaCategoria('T11', categoria)).toBe(conEdicion);
    expect(transicionAplicaALaCategoria('T12', categoria)).toBe(conEdicion);
    for (const { id } of TRANSICIONES.filter((t) => !CON_REGLA_PROPIA.includes(t.id))) {
      expect(transicionAplicaALaCategoria(id, categoria)).toBe(true);
    }
  });

  it('cada categoría tiene exactamente un camino de entrega desde "En Producción"', () => {
    for (const categoria of CATEGORIAS) {
      const salidas = TRANSICIONES.filter(
        (t) => t.origen === 'En Producción' && transicionAplicaALaCategoria(t.id, categoria),
      );
      expect(salidas).toHaveLength(1);
    }
  });
});
