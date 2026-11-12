import { BadRequestException } from '@nestjs/common';
import { crearValidationPipe } from '../../common/pipes/crear-validation-pipe';
import { ENLACE_MAXIMO } from '../../common/validadores/enlace-seguro.decorator';
import { ENLACES_ACEPTADOS, ENLACES_RECHAZADOS_POR_EL_MOTOR, ENLACES_RECHAZADOS_SOLO_POR_EL_DTO } from '../../../test/utils/casos-enlace';
import { MENSAJE_ENLACE_ANEXO } from './create-solicitude.dto';
import { EditarAnexoDto, MENSAJE_ANEXO_ANTERIOR_FORMA } from './editar-anexo.dto';

/*
 * Fase 9 · ADR-009 AN11 (lote J2): forma del cuerpo de PATCH /solicitudes/:radicado/anexo, con el
 * mismo pipe que main.ts. Las dos propiedades son obligatorias y admiten null.
 */
const pipe = crearValidationPipe();

async function erroresDe(cuerpo: object): Promise<string[]> {
  try {
    await pipe.transform(cuerpo, { type: 'body', metatype: EditarAnexoDto });
    return [];
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    return (error.getResponse() as { message: string[] }).message;
  }
}

const URL = 'https://drive.google.com/file/d/guion/view';

describe('EditarAnexoDto (Fase 9 · ADR-009 AN11)', () => {
  it.each([
    ['agregar (null → URL)', { enlace_anexo_anterior: null, enlace_anexo: URL }],
    ['cambiar (URL → otra URL)', { enlace_anexo_anterior: URL, enlace_anexo: `${URL}?v=2` }],
    ['retirar (URL → null)', { enlace_anexo_anterior: URL, enlace_anexo: null }],
    ['null y null (lo decide el servicio: sin_cambios)', { enlace_anexo_anterior: null, enlace_anexo: null }],
    ['un anterior con espacio final (se compara exacto, sin recortar)', { enlace_anexo_anterior: `${URL} `, enlace_anexo: null }],
    [`un anterior de exactamente ${ENLACE_MAXIMO} caracteres`, { enlace_anexo_anterior: 'h'.repeat(ENLACE_MAXIMO), enlace_anexo: null }],
  ])('acepta %s', async (_caso, cuerpo) => {
    expect(await erroresDe(cuerpo)).toEqual([]);
  });

  describe('enlace_anexo_anterior', () => {
    it.each([
      ['ausente', undefined],
      ['la cadena vacía', ''],
      ['solo espacios', '   '],
      ['un número', 5],
      [`${ENLACE_MAXIMO + 1} caracteres`, 'h'.repeat(ENLACE_MAXIMO + 1)],
    ])('rechaza %s', async (_caso, valor) => {
      const cuerpo = valor === undefined ? { enlace_anexo: URL } : { enlace_anexo_anterior: valor, enlace_anexo: URL };

      expect(await erroresDe(cuerpo)).toContain(MENSAJE_ANEXO_ANTERIOR_FORMA);
    });
  });

  describe('enlace_anexo', () => {
    it('ausente → 400 (retirar exige null explícito)', async () => {
      expect(await erroresDe({ enlace_anexo_anterior: null })).toContain(MENSAJE_ENLACE_ANEXO);
    });

    it.each(ENLACES_ACEPTADOS)('acepta %s (fixture compartida)', async (enlace) => {
      expect(await erroresDe({ enlace_anexo_anterior: null, enlace_anexo: enlace })).toEqual([]);
    });

    const rechazados: readonly (readonly [string, unknown])[] = [
      ...ENLACES_RECHAZADOS_POR_EL_MOTOR,
      ...ENLACES_RECHAZADOS_SOLO_POR_EL_DTO,
      ['la cadena vacía', ''],
      ['un número', 5],
    ];

    it.each(rechazados)(
      'rechaza %s (DTO ⊆ CHECK)',
      async (_caso, enlace) => {
        expect(await erroresDe({ enlace_anexo_anterior: null, enlace_anexo: enlace })).toContain(MENSAJE_ENLACE_ANEXO);
      },
    );
  });

  it('un campo desconocido → 400 (forbidNonWhitelisted)', async () => {
    expect(await erroresDe({ enlace_anexo_anterior: null, enlace_anexo: URL, id_usuario: 'otro' })).toContain(
      'property id_usuario should not exist',
    );
  });
});
