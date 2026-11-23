import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { crearValidationPipe } from '../pipes/crear-validation-pipe';
import { ENLACE_MAXIMO, EnlaceSeguro, PATRON_ENLACE_SEGURO } from './enlace-seguro.decorator';
import {
  ENLACES_ACEPTADOS,
  ENLACES_CODIFICADOS,
  ENLACES_CON_CONTROL_SIN_EVIDENCIA_DEL_MOTOR,
  ENLACES_RECHAZADOS_POR_EL_MOTOR,
  ENLACES_RECHAZADOS_SOLO_POR_EL_DTO,
  ENLACES_DENTRO_DEL_LIMITE_DE_LONGITUD,
  ENLACES_FUERA_DEL_LIMITE_DE_LONGITUD,
  enlaceConEmojisDeUnidadesUtf16,
  enlaceConSelectoresDeVariacion,
  enlaceDeLongitud,
} from '../../../test/utils/casos-enlace';
import { longitudReal } from './texto-con-longitud-real.decorator';

const MENSAJE = 'enlace inválido';

class CuerpoDePrueba {
  @EnlaceSeguro(MENSAJE)
  enlace: string;
}

// Mismo pipe que main.ts: el decorador se prueba como corre en producción.
const pipe = crearValidationPipe();

async function erroresDe(cuerpo: object): Promise<string[]> {
  try {
    await pipe.transform(cuerpo, { type: 'body', metatype: CuerpoDePrueba });
    return [];
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    return (error.getResponse() as { message: string[] }).message;
  }
}

describe('EnlaceSeguro (Fase 9 · 9.1.1: fuente única del enlace https://)', () => {
  it.each(ENLACES_ACEPTADOS)('acepta %s', async (enlace) => {
    expect(await erroresDe({ enlace })).toEqual([]);
  });

  it(`acepta un enlace de exactamente ${ENLACE_MAXIMO} caracteres (el límite es inclusivo)`, async () => {
    const enlace = enlaceDeLongitud(ENLACE_MAXIMO);
    expect(enlace).toHaveLength(ENLACE_MAXIMO);
    expect(await erroresDe({ enlace })).toEqual([]);
  });

  it.each([...ENLACES_RECHAZADOS_POR_EL_MOTOR, ...ENLACES_RECHAZADOS_SOLO_POR_EL_DTO])(
    'rechaza %s',
    async (_caso, enlace) => {
      expect(await erroresDe({ enlace })).toContain(MENSAJE);
    },
  );

  // Fase 9 · H0 (P0, fila 28): los controles que \s no reconoce. Los que el motor rechaza ya entran en la lista
  // anterior; estos dos no tienen evidencia del motor y solo se prueban aquí.
  it.each(ENLACES_CON_CONTROL_SIN_EVIDENCIA_DEL_MOTOR)('rechaza %s', async (_caso, enlace) => {
    expect(await erroresDe({ enlace })).toContain(MENSAJE);
  });

  it.each(ENLACES_CODIFICADOS)('acepta el control codificado con %%: %s', async (enlace) => {
    expect(await erroresDe({ enlace })).toEqual([]);
  });

  it(`rechaza un enlace de ${ENLACE_MAXIMO + 1} caracteres`, async () => {
    expect(await erroresDe({ enlace: enlaceDeLongitud(ENLACE_MAXIMO + 1) })).toContain(MENSAJE);
  });

  it('rechaza lo que no es texto', async () => {
    expect(await erroresDe({ enlace: 12345 })).toContain(MENSAJE);
  });

  it('sin @IsOptional, null y el campo ausente se rechazan: la opcionalidad la decide cada DTO', async () => {
    expect(await erroresDe({ enlace: null })).toContain(MENSAJE);
    expect(await erroresDe({})).toContain(MENSAJE);
  });

  // Fase 9 · H0: el patrón cambió a propósito. \S dejaba pasar controles que [:space:] del CHECK rechaza
  // (P0, fila 28); \p{Cc} los excluye y exige la bandera u. Sigue siendo más estricto que el CHECK.
  it('el patrón del pipe excluye espacios y controles: más estricto que ^https://[^[:space:]]+$ del CHECK', () => {
    expect(PATRON_ENLACE_SEGURO.source).toBe('^https:\\/\\/[^\\s\\p{Cc}]+$');
    expect(PATRON_ENLACE_SEGURO.flags).toBe('u');
  });
});

describe('EnlaceSeguro: cada migración de enlaces repite la regla (DTO ⊆ CHECK)', () => {
  const migracion = (carpeta: string): string =>
    readFileSync(join(__dirname, '../../../prisma/migrations', carpeta, 'migration.sql'), 'utf8').replace(
      /--.*$/gm,
      '',
    );

  it.each([
    ['20261028130000_enlace_entrega', 'enlace_entrega'],
    ['20261109110000_enlace_anexo', 'enlace_anexo'],
  ])('%s: https:// sin espacios y hasta ENLACE_MAXIMO', (carpeta, columna) => {
    expect(migracion(carpeta)).toContain(
      `${columna} ~ '^https://[^[:space:]]+$' AND char_length(${columna}) <= ${ENLACE_MAXIMO}`,
    );
  });

  it('el anexo nace validado: su migración no tiene NOT VALID', () => {
    expect(migracion('20261109110000_enlace_anexo')).not.toMatch(/NOT VALID/);
  });
});

/*
 * Fase 9 · H8 y H8b · Longitud: el pipe mide en puntos de código, igual que char_length del motor.
 *
 * Antes de H8b la medía @MaxLength con isLength de validator, que cuenta un par sustituto como 1 (igual que
 * char_length) pero DESCUENTA los selectores de variación U+FE0E y U+FE0F (char_length los cuenta). H8a caracterizó
 * el defecto («DEFECTO PENDIENTE H8b»); H8b invirtió esas aserciones y mide con longitudReal().
 * Qué demuestra: el pipe acepta y rechaza en el mismo punto que char_length(<columna>) <= ENLACE_MAXIMO.
 * Qué NO demuestra: lo que mide el motor está DEDUCIDO de char_length, no medido; ningún caso de este bloque toca
 * PostgreSQL (eso sería H8b-3, en la base desechable de integración).
 */
const LIMITE_DE_IS_URL = 2084; // max_allowed_length por omisión de isURL (validator 13): unidades UTF-16

describe('EnlaceSeguro · longitud en puntos de código, igual que char_length (H8b)', () => {
  // Corrige la hipótesis de H8a: más de ENLACE_MAXIMO unidades UTF-16 NO excede el límite del motor si los puntos de
  // código no lo exceden. Aceptarlo es CORRECTO (DTO ⊆ CHECK se cumple).
  it(`acepta un enlace de más de ${ENLACE_MAXIMO} unidades UTF-16 con menos de ${ENLACE_MAXIMO} puntos de código (correcto)`, async () => {
    const enlace = enlaceConEmojisDeUnidadesUtf16(ENLACE_MAXIMO + 2);
    expect(enlace.length).toBeGreaterThan(ENLACE_MAXIMO);
    expect(longitudReal(enlace)).toBeLessThanOrEqual(ENLACE_MAXIMO);

    expect(await erroresDe({ enlace })).toEqual([]);
  });

  // H8b · Antes era «DEFECTO PENDIENTE H8b»: el pipe aceptaba estos enlaces y el CHECK los rechazaría. La aserción se
  // INVIRTIÓ, no se borró. Un solo mensaje: el patrón y @IsUrl los aceptan, solo falla la longitud.
  it.each([
    ['U+FE0F', 1, ENLACE_MAXIMO + 1, '\uFE0F'],
    ['U+FE0F', 12, ENLACE_MAXIMO + 12, '\uFE0F'],
    ['U+FE0E', 1, ENLACE_MAXIMO + 1, '\uFE0E'],
    ['U+FE0E', 12, ENLACE_MAXIMO + 12, '\uFE0E'],
  ] as const)(
    `H8b · rechaza un enlace con selectores %s (%i) de %i puntos de código (más de ${ENLACE_MAXIMO})`,
    async (_nombre, selectores, puntos, selector) => {
      const enlace = enlaceConSelectoresDeVariacion(puntos, selectores, selector);
      expect(longitudReal(enlace)).toBe(puntos);
      expect(enlace.length).toBeLessThanOrEqual(LIMITE_DE_IS_URL);

      expect(await erroresDe({ enlace })).toEqual([MENSAJE]);
    },
  );

  it.each(ENLACES_DENTRO_DEL_LIMITE_DE_LONGITUD)('H8b-2 · acepta %s (límite inclusivo)', async (_caso, enlace) => {
    expect(await erroresDe({ enlace })).toEqual([]);
  });

  it.each(ENLACES_FUERA_DEL_LIMITE_DE_LONGITUD)('H8b-2 · rechaza %s', async (_caso, enlace) => {
    expect(await erroresDe({ enlace })).toEqual([MENSAJE]);
  });

  it('control: el mismo enlace sin selectores, con los mismos puntos de código, se rechaza', async () => {
    expect(await erroresDe({ enlace: enlaceDeLongitud(ENLACE_MAXIMO + 1) })).toEqual([MENSAJE]);
  });

  // No cambia con H8b: @IsUrl rechaza por su cuenta más de LIMITE_DE_IS_URL unidades UTF-16, aunque los puntos de
  // código quepan en ENLACE_MAXIMO. Es más estricto que el CHECK, lo que DTO ⊆ CHECK permite.
  it(`@IsUrl rechaza más de ${LIMITE_DE_IS_URL} unidades UTF-16 aunque los puntos de código quepan (más estricto que el CHECK)`, async () => {
    const enlace = enlaceConEmojisDeUnidadesUtf16(LIMITE_DE_IS_URL + 2);
    expect(enlace.length).toBeGreaterThan(LIMITE_DE_IS_URL);
    expect(longitudReal(enlace)).toBeLessThanOrEqual(ENLACE_MAXIMO);

    expect(await erroresDe({ enlace })).toEqual([MENSAJE]);
  });
});

/*
 * Fase 9 · H8a (L2) · B5 y B6 de Log_Auditoria frente a los CHECK de formato de las columnas de Solicitud.
 *
 * Qué demuestra: en el TEXTO de las migraciones, los cuatro predicados de formato (enlace_entrega, enlace_anexo,
 * enlace_anterior y enlace_nuevo) son la misma expresión, cambiando solo la columna, y esa expresión es la de la
 * fuente única (prefijo, clase de espacios y ENLACE_MAXIMO). Así, un enlace anterior leído de Solicitud cumple B5,
 * y un enlace nuevo que el pipe acepta se mide contra el mismo predicado en B6 que en su columna de Solicitud.
 * La comparación ignora los comentarios, los saltos de línea y los espacios; detecta otro patrón, otro límite,
 * otro operador, una condición de más o de menos, una columna equivocada o un NOT VALID.
 *
 * Qué NO demuestra: lo que está instalado en una base (I-40a comprueba nombres y validez, no el texto que
 * PostgreSQL reescribe), ni el significado de [:space:] en el motor, ni la compatibilidad de todo Unicode.
 */
describe('EnlaceSeguro: B5 y B6 del log repiten el predicado de formato de Solicitud (H8a)', () => {
  const FASE_8 = '20261028130000_enlace_entrega';
  const H1 = '20261109110000_enlace_anexo';
  const sinComentarios = (carpeta: string): string =>
    readFileSync(join(__dirname, '../../../prisma/migrations', carpeta, 'migration.sql'), 'utf8').replace(/--.*$/gm, '');

  /** El predicado del CHECK de una restricción VALIDADA, por su nombre exacto, con los espacios normalizados. */
  const predicadoDe = (carpeta: string, restriccion: string): string => {
    const hallado = new RegExp(`ADD CONSTRAINT "${restriccion}"\\s+CHECK\\s*\\(([\\s\\S]*?)\\)\\s*;`).exec(sinComentarios(carpeta));
    const predicado = hallado?.[1];
    if (predicado === undefined) {
      throw new Error(`No se encontró el CHECK ${restriccion} en ${carpeta}: ¿cambió su formato? Actualiza esta prueba a propósito.`);
    }
    return predicado.replace(/\s+/g, ' ').trim();
  };
  /** El predicado con su columna sustituida: dos predicados corresponden si dan la misma plantilla. */
  const comoPlantilla = (predicado: string, columna: string): string => predicado.split(columna).join('<columna>');

  const PLANTILLA = `<columna> ~ '^https://[^[:space:]]+$' AND char_length(<columna>) <= ${ENLACE_MAXIMO}`;
  const FORMATOS: readonly (readonly [string, string, string, string])[] = [
    ['enlace_entrega de Solicitud (Fase 8)', FASE_8, 'Solicitud_enlace_entrega_formato_check', 'enlace_entrega'],
    ['enlace_anexo de Solicitud (A2)', H1, 'Solicitud_enlace_anexo_formato_check', 'enlace_anexo'],
    ['enlace_anterior de Log_Auditoria (B5)', H1, 'Log_Auditoria_enlace_anterior_formato_check', 'enlace_anterior'],
    ['enlace_nuevo de Log_Auditoria (B6)', H1, 'Log_Auditoria_enlace_nuevo_formato_check', 'enlace_nuevo'],
  ];

  it.each(FORMATOS)('%s: su CHECK es exactamente la plantilla de la fuente única', (_caso, carpeta, restriccion, columna) => {
    expect(comoPlantilla(predicadoDe(carpeta, restriccion), columna)).toBe(PLANTILLA);
  });

  it('B5 y B6 son el mismo predicado que A2 y que el de enlace_entrega: solo cambia la columna', () => {
    const plantillas = FORMATOS.map(([, carpeta, restriccion, columna]) => comoPlantilla(predicadoDe(carpeta, restriccion), columna));

    expect(new Set(plantillas)).toEqual(new Set([PLANTILLA]));
  });

  it('la comparación no depende del formato: otro patrón, otro límite, una condición de más o la columna equivocada no pasan', () => {
    const b5 = predicadoDe(H1, 'Log_Auditoria_enlace_anterior_formato_check');

    expect(comoPlantilla(b5.replace('[^[:space:]]', '[^ ]'), 'enlace_anterior')).not.toBe(PLANTILLA);
    expect(comoPlantilla(b5.replace(String(ENLACE_MAXIMO), String(ENLACE_MAXIMO + 1)), 'enlace_anterior')).not.toBe(PLANTILLA);
    expect(comoPlantilla(`${b5} OR enlace_anterior IS NULL`, 'enlace_anterior')).not.toBe(PLANTILLA);
    expect(comoPlantilla(b5, 'enlace_nuevo')).not.toBe(PLANTILLA);
  });
});
