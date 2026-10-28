import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CategoriaSolicitud, SubEspacio } from '@prisma/client';
import { RESTRICCIONES_CA06_POR_SUBESPACIO } from '../errores/traslape-ca06';
import { CATEGORIA_QUE_ELIGE_SUB_ESPACIO } from './categorias';
import {
  OCUPA,
  RESTRICCION_DEL_SUBESPACIO,
  SUB_ESPACIO_DE_SERVICIOS,
  SUB_ESPACIOS,
  subEspacioAlRadicar,
  subEspaciosEnConflicto,
  type SubEspacioFisico,
} from './sub-espacios';

const MIGRACION_SUBESPACIOS = join(
  __dirname,
  '../../../prisma/migrations/20261023120000_ca06_subespacios/migration.sql',
);
const MIGRACION_CONTRACT = join(
  __dirname,
  '../../../prisma/migrations/20261027120000_ca06_subespacios_contract/migration.sql',
);

const { CABINA_AUDIO, ESTUDIO_GRABACION, ESTUDIO_COMPLETO } = SubEspacio;

/**
 * ORÁCULO: transcripción a mano de la tabla del PRD v2.2 §5.1 (✅ conviven, ❌ conflicto).
 * Se compara contra ella, nunca contra OCUPA (eso sería una tautología).
 */
const TABLA_PRD: ReadonlyArray<readonly [SubEspacio, SubEspacio, boolean]> = [
  [CABINA_AUDIO, CABINA_AUDIO, true],
  [CABINA_AUDIO, ESTUDIO_GRABACION, false],
  [CABINA_AUDIO, ESTUDIO_COMPLETO, true],
  [ESTUDIO_GRABACION, CABINA_AUDIO, false],
  [ESTUDIO_GRABACION, ESTUDIO_GRABACION, true],
  [ESTUDIO_GRABACION, ESTUDIO_COMPLETO, true],
  [ESTUDIO_COMPLETO, CABINA_AUDIO, true],
  [ESTUDIO_COMPLETO, ESTUDIO_GRABACION, true],
  [ESTUDIO_COMPLETO, ESTUDIO_COMPLETO, true],
];

interface ExclusionEnElSql {
  readonly nombre: string;
  readonly estadosQueLiberan: readonly string[];
  readonly subEspacios: readonly string[];
}

/**
 * Las restricciones de exclusión que CREA la migración, leídas de su SQL. Sin
 * comentarios: la cabecera documenta la reversión con otro EXCLUDE que no se ejecuta.
 */
function exclusionesDeLaMigracion(): ExclusionEnElSql[] {
  const sql = readFileSync(MIGRACION_SUBESPACIOS, 'utf8').replace(/\r\n/g, '\n').replace(/--.*$/gm, '');
  const literales = (lista: string): string[] => [...lista.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  return [
    ...sql.matchAll(
      /ADD CONSTRAINT "([^"]+)"\s+EXCLUDE[^;]*?estado NOT IN \(([^)]*)\)\s+AND sub_espacio IN \(([^)]*)\)\);/g,
    ),
  ].map(([, nombre, estados, subEspacios]) => ({
    nombre,
    estadosQueLiberan: literales(estados),
    subEspacios: literales(subEspacios),
  }));
}

describe('Sub-espacios y CA-06 (PRD v2.2 §5.1 · ADR-007 SE1, SE2 y SE4)', () => {
  it('las tres opciones de reserva, en el orden del enum de Prisma', () => {
    expect(SUB_ESPACIOS).toEqual(['CABINA_AUDIO', 'ESTUDIO_GRABACION', 'ESTUDIO_COMPLETO']);
    expect(SUB_ESPACIOS).toEqual(Object.values(SubEspacio));
  });

  it('el completo ocupa los dos sub-espacios físicos; cada uno de los otros, solo el suyo', () => {
    expect(OCUPA).toEqual({
      CABINA_AUDIO: ['CABINA_AUDIO'],
      ESTUDIO_GRABACION: ['ESTUDIO_GRABACION'],
      ESTUDIO_COMPLETO: ['CABINA_AUDIO', 'ESTUDIO_GRABACION'],
    });
  });

  it.each(TABLA_PRD)('%s contra %s: ¿conflicto? %s', (a, b, choca) => {
    expect(subEspaciosEnConflicto(a).includes(b)).toBe(choca);
  });

  it('SE10: un servicio reserva el completo, que choca con todo (protege los dos sub-espacios)', () => {
    expect(SUB_ESPACIO_DE_SERVICIOS).toBe(ESTUDIO_COMPLETO);
    expect(subEspaciosEnConflicto(SUB_ESPACIO_DE_SERVICIOS)).toEqual([...SUB_ESPACIOS]);
  });

  it('contract (7A.8): la columna ya no tiene DEFAULT; el código es el único que decide el lugar', () => {
    const sql = readFileSync(MIGRACION_CONTRACT, 'utf8').replace(/\r\n/g, '\n').replace(/--.*$/gm, '');
    expect(sql).toMatch(/ALTER TABLE "Solicitud" ALTER COLUMN "sub_espacio" DROP DEFAULT;/);
    expect(sql).not.toMatch(/SET DEFAULT/);
  });

  it('la relación de conflicto es simétrica', () => {
    for (const a of SUB_ESPACIOS) {
      for (const b of SUB_ESPACIOS) {
        expect(subEspaciosEnConflicto(a).includes(b)).toBe(subEspaciosEnConflicto(b).includes(a));
      }
    }
  });

  it('los nombres de las restricciones son los de la lista cerrada del detector (7A.1)', () => {
    // Object.values ya es un arreglo nuevo; la constante del detector es de solo lectura y sí se copia.
    expect(Object.values(RESTRICCION_DEL_SUBESPACIO).sort()).toEqual([...RESTRICCIONES_CA06_POR_SUBESPACIO].sort());
  });
});

describe('Sub-espacios: el código coincide EXACTAMENTE con los predicados de la migración', () => {
  const exclusiones = exclusionesDeLaMigracion();

  it('la migración crea exactamente una restricción por sub-espacio físico, con su nombre', () => {
    // Piso: si el formato del SQL cambia y no se lee nada, esta prueba lo dice en lugar de pasar vacía.
    expect(exclusiones).toHaveLength(2);
    const fisicos = Object.keys(RESTRICCION_DEL_SUBESPACIO) as SubEspacioFisico[];
    expect(exclusiones.map((e) => e.nombre).sort()).toEqual(fisicos.map((f) => RESTRICCION_DEL_SUBESPACIO[f]).sort());
  });

  it('cada restricción cubre exactamente las opciones que ocupan su sub-espacio físico', () => {
    for (const [fisico, nombre] of Object.entries(RESTRICCION_DEL_SUBESPACIO) as [SubEspacioFisico, string][]) {
      const enElSql = exclusiones.find((e) => e.nombre === nombre);
      const esperadas = SUB_ESPACIOS.filter((opcion) => OCUPA[opcion].includes(fisico));
      expect(enElSql?.subEspacios.slice().sort()).toEqual([...esperadas].sort());
    }
  });

  it('la relación de conflicto que DERIVAN los predicados del SQL es la de subEspaciosEnConflicto()', () => {
    const chocanEnElSql = (a: SubEspacio, b: SubEspacio): boolean =>
      exclusiones.some((e) => e.subEspacios.includes(a) && e.subEspacios.includes(b));
    for (const a of SUB_ESPACIOS) {
      expect(SUB_ESPACIOS.filter((b) => chocanEnElSql(a, b))).toEqual([...subEspaciosEnConflicto(a)]);
    }
  });
});

describe('subEspacioAlRadicar (Fase 7 · 7B.4 · ADR-007 SE10)', () => {
  const SERVICIOS = Object.values(CategoriaSolicitud).filter((c) => c !== CATEGORIA_QUE_ELIGE_SUB_ESPACIO);

  it('solo la solicitud de espacio físico elige; las otras cuatro categorías son servicios', () => {
    expect(CATEGORIA_QUE_ELIGE_SUB_ESPACIO).toBe(CategoriaSolicitud.ESPACIOS);
    expect([...SERVICIOS].sort()).toEqual(['ASESORIAS', 'PODCAST', 'STREAMING', 'VIDEO']);
  });

  it.each(SUB_ESPACIOS)('espacio físico con %s → se guarda lo elegido', (subEspacio) => {
    expect(subEspacioAlRadicar(CategoriaSolicitud.ESPACIOS, subEspacio)).toEqual({ ok: true, subEspacio });
  });

  it('espacio físico sin sub-espacio → REQUERIDO_EN_ESPACIOS (CA-12)', () => {
    expect(subEspacioAlRadicar(CategoriaSolicitud.ESPACIOS, undefined)).toEqual({ ok: false, error: 'REQUERIDO_EN_ESPACIOS' });
  });

  it.each(SERVICIOS)('%s sin sub-espacio → el completo', (categoria) => {
    expect(subEspacioAlRadicar(categoria, undefined)).toEqual({ ok: true, subEspacio: ESTUDIO_COMPLETO });
  });

  it.each(SERVICIOS)('%s con un sub-espacio (cualquiera, incluso el completo) → SOLO_EN_ESPACIOS: no se ignora', (categoria) => {
    for (const subEspacio of SUB_ESPACIOS) {
      expect(subEspacioAlRadicar(categoria, subEspacio)).toEqual({ ok: false, error: 'SOLO_EN_ESPACIOS' });
    }
  });
});
