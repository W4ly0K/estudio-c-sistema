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
  enlaceDeLongitud,
} from '../../../test/utils/casos-enlace';

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
