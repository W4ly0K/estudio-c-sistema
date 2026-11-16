import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { crearValidationPipe } from '../../common/pipes/crear-validation-pipe';
import { ENLACE_MAXIMO } from '../../common/validadores/enlace-seguro.decorator';
import {
  ENLACES_ACEPTADOS,
  ENLACES_CON_ESPACIO_UNICODE_RECHAZADOS_POR_EL_DTO,
  ENLACES_RECHAZADOS_POR_EL_MOTOR,
  ENLACES_RECHAZADOS_SOLO_POR_EL_DTO,
  enlaceConSelectoresDeVariacion,
} from '../../../test/utils/casos-enlace';
import { longitudReal } from '../../common/validadores/texto-con-longitud-real.decorator';
import { MENSAJE_ENLACE_ENTREGA } from './update-solicitude.dto';
import {
  CorregirEnlaceEntregaDto,
  MENSAJE_ENTREGA_ANTERIOR_FORMA,
  MENSAJE_MOTIVO_CORRECCION,
  MOTIVO_CORRECCION_MAXIMO,
  MOTIVO_CORRECCION_MINIMO,
} from './corregir-enlace-entrega.dto';

/*
 * Fase 9 · ADR-008 EN7 y EN10 (lote J3): forma del cuerpo de PATCH /solicitudes/:radicado/enlace-entrega,
 * con el mismo pipe que main.ts.
 */
const pipe = crearValidationPipe();

async function resultado(cuerpo: object): Promise<{ errores: string[]; dto?: CorregirEnlaceEntregaDto }> {
  try {
    const dto = (await pipe.transform(cuerpo, { type: 'body', metatype: CorregirEnlaceEntregaDto })) as CorregirEnlaceEntregaDto;
    return { errores: [], dto };
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    return { errores: (error.getResponse() as { message: string[] }).message };
  }
}
const erroresDe = async (cuerpo: object) => (await resultado(cuerpo)).errores;

const A = 'https://youtu.be/entrega-a';
const B = 'https://youtu.be/entrega-b';
const BASE = { enlace_entrega_anterior: A, enlace_entrega: B };

describe('CorregirEnlaceEntregaDto (Fase 9 · ADR-008 EN7 y EN10)', () => {
  it.each([
    ['sin motivo', BASE],
    ['un anterior con espacio final (se compara exacto, sin recortar)', { ...BASE, enlace_entrega_anterior: `${A} ` }],
    [`un anterior de exactamente ${ENLACE_MAXIMO} caracteres`, { ...BASE, enlace_entrega_anterior: 'h'.repeat(ENLACE_MAXIMO) }],
  ])('acepta %s', async (_caso, cuerpo) => {
    expect(await erroresDe(cuerpo)).toEqual([]);
  });

  it('el anterior no se recorta: llega al servicio tal cual', async () => {
    expect((await resultado({ ...BASE, enlace_entrega_anterior: `${A} ` })).dto?.enlace_entrega_anterior).toBe(`${A} `);
  });

  describe('enlace_entrega_anterior (obligatorio, sin null)', () => {
    it.each([
      ['ausente', undefined],
      ['null', null],
      ['la cadena vacía', ''],
      ['solo espacios', '   '],
      ['un número', 5],
      [`${ENLACE_MAXIMO + 1} caracteres`, 'h'.repeat(ENLACE_MAXIMO + 1)],
    ])('rechaza %s', async (_caso, valor) => {
      const cuerpo = valor === undefined ? { enlace_entrega: B } : { ...BASE, enlace_entrega_anterior: valor };

      expect(await erroresDe(cuerpo)).toContain(MENSAJE_ENTREGA_ANTERIOR_FORMA);
    });
  });

  describe('enlace_entrega (obligatorio, sin null: el enlace de entrega no se retira)', () => {
    it.each(ENLACES_ACEPTADOS)('acepta %s (fixture compartida)', async (enlace) => {
      expect(await erroresDe({ ...BASE, enlace_entrega: enlace })).toEqual([]);
    });

    const rechazados: readonly (readonly [string, unknown])[] = [
      ...ENLACES_RECHAZADOS_POR_EL_MOTOR,
      ...ENLACES_RECHAZADOS_SOLO_POR_EL_DTO,
      ['null (no se retira)', null],
      ['la cadena vacía', ''],
      ['un número', 5],
    ];

    it.each(rechazados)('rechaza %s (DTO ⊆ CHECK)', async (_caso, enlace) => {
      expect(await erroresDe({ ...BASE, enlace_entrega: enlace })).toContain(MENSAJE_ENLACE_ENTREGA);
    });

    // Fase 9 · H8a (L3). Qué demuestra: el pipe rechaza estos tres espacios Unicode en la ruta, la consulta y el
    // fragmento, así que no llegan al motor. Qué NO demuestra: lo que haría el motor con ellos, ni la compatibilidad
    // de todo Unicode entre \s de JavaScript y [:space:] de PostgreSQL (P0 la midió acotada a 35 candidatos).
    it.each(ENLACES_CON_ESPACIO_UNICODE_RECHAZADOS_POR_EL_DTO)('rechaza un espacio Unicode: %s', async (_caso, enlace) => {
      expect(await erroresDe({ ...BASE, enlace_entrega: enlace })).toContain(MENSAJE_ENLACE_ENTREGA);
    });

    // CARACTERIZACIÓN DE UN DEFECTO PENDIENTE (H8b), no el comportamiento deseado: este DTO acepta hoy un enlace que
    // char_length cuenta en ENLACE_MAXIMO + 1 (el CHECK lo rechazaría). Al corregir H8b se invierte la aserción.
    it(`DEFECTO PENDIENTE H8b · hoy acepta un enlace con un selector U+FE0F de ${ENLACE_MAXIMO + 1} puntos de código`, async () => {
      const enlace = enlaceConSelectoresDeVariacion(ENLACE_MAXIMO + 1, 1);
      expect(longitudReal(enlace)).toBe(ENLACE_MAXIMO + 1);

      expect(await erroresDe({ ...BASE, enlace_entrega: enlace })).toEqual([]);
    });

    it('ausente → 400', async () => {
      expect(await erroresDe({ enlace_entrega_anterior: A })).toContain(MENSAJE_ENLACE_ENTREGA);
    });
  });

  describe('motivo_correccion (opcional, de 10 a 500 caracteres reales)', () => {
    it('ausente es válido y llega como undefined (el servicio omite entonces la propiedad del evento)', async () => {
      const { errores, dto } = await resultado(BASE);

      expect(errores).toEqual([]);
      // class-transformer aplica el @Transform aunque la propiedad no venga: la clave puede existir con
      // undefined. Lo que importa es el valor; la omisión en el evento la prueban el servicio e I-43b.
      expect(dto?.motivo_correccion).toBeUndefined();
    });

    it.each([
      [`exactamente ${MOTIVO_CORRECCION_MINIMO} caracteres`, 'a'.repeat(MOTIVO_CORRECCION_MINIMO)],
      [`exactamente ${MOTIVO_CORRECCION_MAXIMO} caracteres`, 'a'.repeat(MOTIVO_CORRECCION_MAXIMO)],
      ['10 caracteres reales con un emoji (11 unidades UTF-16)', `${'a'.repeat(9)}🎬`],
    ])('acepta %s', async (_caso, motivo) => {
      expect(await erroresDe({ ...BASE, motivo_correccion: motivo })).toEqual([]);
    });

    it('se guarda recortado: el valor validado es el que se escribirá', async () => {
      const { dto } = await resultado({ ...BASE, motivo_correccion: '   El enlace apuntaba a un borrador.  ' });

      expect(dto?.motivo_correccion).toBe('El enlace apuntaba a un borrador.');
    });

    it.each([
      ['null (no se convierte en «sin motivo»)', null],
      ['la cadena vacía', ''],
      ['solo espacios', '      '],
      ['un número', 12345678901],
      [`${MOTIVO_CORRECCION_MINIMO - 1} caracteres`, 'a'.repeat(MOTIVO_CORRECCION_MINIMO - 1)],
      [`${MOTIVO_CORRECCION_MINIMO - 1} caracteres con espacios en los extremos`, `   ${'a'.repeat(MOTIVO_CORRECCION_MINIMO - 1)}   `],
      [`${MOTIVO_CORRECCION_MAXIMO + 1} caracteres`, 'a'.repeat(MOTIVO_CORRECCION_MAXIMO + 1)],
    ])('rechaza %s', async (_caso, motivo) => {
      expect(await erroresDe({ ...BASE, motivo_correccion: motivo })).toContain(MENSAJE_MOTIVO_CORRECCION);
    });

    it('los límites coinciden con B9 de la migración consolidada (H1, solo lectura)', () => {
      const sql = readFileSync(
        join(__dirname, '../../../prisma/migrations/20261109110000_enlace_anexo/migration.sql'),
        'utf8',
      );

      expect(sql).toContain(
        `char_length(btrim(motivo_correccion)) BETWEEN ${MOTIVO_CORRECCION_MINIMO} AND ${MOTIVO_CORRECCION_MAXIMO}`,
      );
    });
  });

  it('un campo desconocido → 400 (forbidNonWhitelisted)', async () => {
    expect(await erroresDe({ ...BASE, estado: 'Entregado' })).toContain('property estado should not exist');
  });
});
