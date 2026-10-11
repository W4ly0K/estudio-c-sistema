import { BadRequestException } from '@nestjs/common';
import { crearValidationPipe } from '../pipes/crear-validation-pipe';
import { longitudReal, TextoConLongitudReal } from './texto-con-longitud-real.decorator';

const MENSAJE = 'texto inválido';

class CuerpoDePrueba {
  @TextoConLongitudReal(3, 5, MENSAJE)
  texto: string;
}

// Mismo pipe que main.ts: Transform + ValidateBy se prueban como corren en producción.
const pipe = crearValidationPipe();

async function validar(cuerpo: object): Promise<{ valor?: CuerpoDePrueba; errores: string[] }> {
  try {
    const valor = (await pipe.transform(cuerpo, { type: 'body', metatype: CuerpoDePrueba })) as CuerpoDePrueba;
    return { valor, errores: [] };
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    return { errores: (error.getResponse() as { message: string[] }).message };
  }
}

describe('TextoConLongitudReal (Fase 6.1b · DB2)', () => {
  describe('longitudReal', () => {
    it.each([
      ['', 0],
      ['abc', 3],
      ['ñandú', 5],
      ['🎬', 1],
      ['🎬🎬🎬', 3],
    ])('"%s" mide %i caracteres reales', (texto, esperado) => {
      expect(longitudReal(texto)).toBe(esperado);
    });

    it('difiere de String.length con emojis (el motivo de este validador)', () => {
      expect('🎬🎬'.length).toBe(4);
      expect(longitudReal('🎬🎬')).toBe(2);
    });
  });

  it('acepta los límites exactos y entrega el texto recortado', async () => {
    expect(await validar({ texto: 'abc' })).toEqual({ valor: expect.objectContaining({ texto: 'abc' }), errores: [] });
    expect((await validar({ texto: '  abcde  ' })).valor?.texto).toBe('abcde');
  });

  it('cuenta emojis como un carácter cada uno', async () => {
    expect((await validar({ texto: '🎬🎬🎬' })).errores).toEqual([]);
    expect((await validar({ texto: '🎬🎬' })).errores).toEqual([MENSAJE]);
  });

  it.each([
    ['ausente', {}],
    ['null', { texto: null }],
    ['un número', { texto: 12345 }],
    ['vacío', { texto: '' }],
    ['solo espacios', { texto: '      ' }],
    ['corto tras recortar', { texto: '  ab  ' }],
    ['largo', { texto: 'abcdef' }],
  ])('rechaza un texto %s con un único mensaje', async (_caso, cuerpo) => {
    expect((await validar(cuerpo)).errores).toEqual([MENSAJE]);
  });
});
