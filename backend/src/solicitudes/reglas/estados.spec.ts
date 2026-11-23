import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CategoriaSolicitud } from '@prisma/client';
import { CATEGORIAS_CON_EDICION } from './categorias';
import { ESTADO_QUE_LIBERA_SEGUN_CATEGORIA, ESTADOS_QUE_LIBERAN_FRANJA, FILTRO_OCUPA_FRANJA, ocupaFranja } from './estados';
import { ESTADOS } from './maquina-estados';

// Fase 8 · 8.5: la definición VIGENTE de las dos restricciones es la de esta migración (recrea
// las de la Fase 7 con el estado nuevo y la cláusula de "Entregado" por categoría).
const MIGRACION_CA06 = join(
  __dirname,
  '../../../prisma/migrations/20261028120000_ca06_edicion_postproduccion/migration.sql',
);

const CATEGORIAS = Object.values(CategoriaSolicitud);
const SIEMPRE_LIBERAN = ['Rechazado', 'Cancelado por el Usuario', 'No atendida', 'Edición y postproducción'];

/**
 * ORÁCULO: transcripción a mano de la directriz del tutor (requisito 3) y de la Opción A de H1:
 * qué estados LIBERAN la franja en cada categoría. Todo lo demás la ocupa.
 */
const LIBERAN: Readonly<Record<CategoriaSolicitud, readonly string[]>> = {
  PODCAST: [...SIEMPRE_LIBERAN, 'Entregado'],
  VIDEO: [...SIEMPRE_LIBERAN, 'Entregado'],
  ESPACIOS: SIEMPRE_LIBERAN,
  STREAMING: SIEMPRE_LIBERAN,
  ASESORIAS: SIEMPRE_LIBERAN,
};

describe('Estados y ocupación de la franja (CA-06)', () => {
  it.each(CATEGORIAS)('%s: exactamente los estados del oráculo liberan la franja', (categoria) => {
    expect(ESTADOS.filter((estado) => !ocupaFranja(estado, categoria)).sort()).toEqual([...LIBERAN[categoria]].sort());
  });

  it('D3: "Pendiente de Reprogramación" ocupa su franja original en todas las categorías', () => {
    for (const categoria of CATEGORIAS) {
      expect(ocupaFranja('Pendiente de Reprogramación', categoria)).toBe(true);
    }
  });

  it('un estado desconocido OCUPA la franja (fail-closed, como el motor)', () => {
    for (const categoria of CATEGORIAS) {
      expect(ocupaFranja('Estado inventado', categoria)).toBe(true);
      expect(ocupaFranja('rechazado', categoria)).toBe(true); // otra capitalización no libera nada
      expect(ocupaFranja('entregado', categoria)).toBe(true);
      expect(ocupaFranja('Edicion y postproduccion', categoria)).toBe(true); // sin tildes no libera
    }
  });

  it('el filtro de Prisma de la consulta previa expresa la misma regla', () => {
    expect(FILTRO_OCUPA_FRANJA).toEqual({
      estado: { notIn: [...SIEMPRE_LIBERAN] },
      OR: [{ estado: { not: 'Entregado' } }, { categoria: { notIn: [CategoriaSolicitud.PODCAST, CategoriaSolicitud.VIDEO] } }],
    });
  });

  it('la regla coincide EXACTAMENTE con el WHERE de CADA restricción de la migración vigente', () => {
    // Sin comentarios: la cabecera documenta una reversión que no se ejecuta.
    const sql = readFileSync(MIGRACION_CA06, 'utf8').replace(/--.*$/gm, '');
    const literales = (lista: string): string[] => [...lista.matchAll(/'([^']*)'/g)].map((m) => m[1]).sort();
    const listas = [...sql.matchAll(/estado NOT IN \(([^)]*)\)/g)].map((coincidencia) => literales(coincidencia[1]));
    const condicionadas = [...sql.matchAll(/AND NOT \(estado = '([^']*)' AND categoria IN \(([^)]*)\)\)/g)];

    // Una por sub-espacio físico: si el formato cambia y no se lee ninguna, falla aquí.
    expect(listas).toHaveLength(2);
    expect(condicionadas).toHaveLength(2);
    for (const enLaMigracion of listas) {
      expect([...ESTADOS_QUE_LIBERAN_FRANJA].sort()).toEqual(enLaMigracion);
    }
    for (const [, estado, categorias] of condicionadas) {
      expect(estado).toBe(ESTADO_QUE_LIBERA_SEGUN_CATEGORIA);
      expect(literales(categorias)).toEqual([...CATEGORIAS_CON_EDICION].sort());
    }
  });
});
