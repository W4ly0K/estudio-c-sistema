import { BadRequestException, Type } from '@nestjs/common';
import { CategoriaSolicitud, SubEspacio } from '@prisma/client';
import { crearValidationPipe } from '../../common/pipes/crear-validation-pipe';
import { CreateSolicitudeDto } from './create-solicitude.dto';
import { MENSAJE_MOTIVO_RECHAZO, UpdateSolicitudeDto } from './update-solicitude.dto';
import {
  MENSAJE_MOTIVO_REPROGRAMACION,
  MENSAJE_SUBESPACIO_PROPUESTO,
  ProponerReprogramacionDto,
} from './proponer-reprogramacion.dto';

// Mismo pipe que main.ts (fuente única): si alguien cambia la configuración real, estos tests lo notan.
const pipe = crearValidationPipe();

async function erroresDe(cuerpo: object, metatype: Type<unknown>): Promise<string[]> {
  try {
    await pipe.transform(cuerpo, { type: 'body', metatype });
    return [];
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const respuesta = error.getResponse() as { message: string[] };
    return respuesta.message;
  }
}

const inicio = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const fin = new Date(inicio.getTime() + 60 * 60 * 1000);

// Exactamente los 4 campos que envía Dashboard.jsx
const cuerpoFrontend = {
  categoria: CategoriaSolicitud.ESPACIOS,
  proposito: 'Grabación de clase magistral',
  fecha_inicio: inicio.toISOString(),
  fecha_fin: fin.toISOString(),
};

describe('Validación de DTOs de solicitudes (crearValidationPipe)', () => {
  describe('CreateSolicitudeDto', () => {
    it('acepta el cuerpo que envía el frontend (sin regresión)', async () => {
      expect(await erroresDe(cuerpoFrontend, CreateSolicitudeDto)).toEqual([]);
    });

    it.each([
      ['sin zona horaria', '2026-10-27T08:00:00'],
      ['solo la fecha', '2026-10-27'],
      ['30 de febrero (V8 lo normalizaría al 2 de marzo)', '2026-02-30T13:00:00Z'],
    ])('rechaza fecha_inicio %s (D-W)', async (_caso, fecha) => {
      const errores = await erroresDe({ ...cuerpoFrontend, fecha_inicio: fecha }, CreateSolicitudeDto);
      expect(errores.join(' ')).toContain('fecha_inicio debe ser una fecha ISO 8601 real con zona horaria');
    });

    it('rechaza una fecha_fin que no es texto (por ejemplo, un timestamp numérico)', async () => {
      const errores = await erroresDe({ ...cuerpoFrontend, fecha_fin: 1791900000000 }, CreateSolicitudeDto);
      expect(errores.join(' ')).toContain('fecha_fin debe ser una fecha ISO 8601 real con zona horaria');
    });

    it('NO rechaza una fecha pasada: esa regla vive en evaluarHorario con el Reloj (fin del @MinDate congelado)', async () => {
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const cuerpo = {
        ...cuerpoFrontend,
        fecha_inicio: ayer.toISOString(),
        fecha_fin: new Date(ayer.getTime() + 60 * 60 * 1000).toISOString(),
      };
      expect(await erroresDe(cuerpo, CreateSolicitudeDto)).toEqual([]);
    });

    it('rechaza con 400 un id_usuario en el body (la identidad viene del JWT)', async () => {
      const errores = await erroresDe({ ...cuerpoFrontend, id_usuario: 'uuid-ajeno' }, CreateSolicitudeDto);
      expect(errores).toContain('property id_usuario should not exist');
    });

    // Fase 7 · 7A.4 (ADR-007 SE5): el sub-espacio es opcional durante el expand.
    it.each(Object.values(SubEspacio))('acepta el sub-espacio %s', async (subEspacio) => {
      expect(await erroresDe({ ...cuerpoFrontend, sub_espacio: subEspacio }, CreateSolicitudeDto)).toEqual([]);
    });

    it.each([
      ['un valor inventado', 'SALA_3'],
      ['otra capitalización', 'cabina_audio'],
      ['un número', 1],
    ])('rechaza con 400 un sub_espacio con %s', async (_caso, valor) => {
      const errores = await erroresDe({ ...cuerpoFrontend, sub_espacio: valor }, CreateSolicitudeDto);
      expect(errores).toContain('El sub-espacio debe ser CABINA_AUDIO, ESTUDIO_GRABACION o ESTUDIO_COMPLETO');
    });
  });

  describe('UpdateSolicitudeDto', () => {
    it('acepta un cambio de estado válido', async () => {
      expect(await erroresDe({ estado: 'Validado' }, UpdateSolicitudeDto)).toEqual([]);
    });

    it('hereda el sub_espacio opcional (cuándo se admite lo decide el servicio: D-4)', async () => {
      expect(await erroresDe({ estado: 'Validado', sub_espacio: SubEspacio.CABINA_AUDIO }, UpdateSolicitudeDto)).toEqual([]);
      expect(await erroresDe({ sub_espacio: 'SALA_3' }, UpdateSolicitudeDto)).toContain(
        'El sub-espacio debe ser CABINA_AUDIO, ESTUDIO_GRABACION o ESTUDIO_COMPLETO',
      );
    });

    it('rechaza con 400 un modificado_por en el body (Zero Trust en auditoría)', async () => {
      const errores = await erroresDe(
        { estado: 'Validado', modificado_por: 'uuid-ajeno' },
        UpdateSolicitudeDto,
      );
      expect(errores).toContain('property modificado_por should not exist');
    });

    it('exige motivo_rechazo al rechazar una solicitud', async () => {
      const errores = await erroresDe({ estado: 'Rechazado' }, UpdateSolicitudeDto);
      expect(errores).toEqual([MENSAJE_MOTIVO_RECHAZO]);
    });

    it('rechaza motivos de relleno (menos de 10 caracteres)', async () => {
      const errores = await erroresDe(
        { estado: 'Rechazado', motivo_rechazo: 'no' },
        UpdateSolicitudeDto,
      );
      expect(errores).toEqual([MENSAJE_MOTIVO_RECHAZO]);
    });

    describe('motivo_rechazo (Fase 6.5b · DE1): el mismo validador que el motivo de la reprogramación', () => {
      const rechazo = { estado: 'Rechazado' };

      it('entrega el motivo recortado: el log guarda exactamente lo que se validó', async () => {
        const dto: unknown = await pipe.transform(
          { ...rechazo, motivo_rechazo: '   Equipo en mantenimiento   ' },
          { type: 'body', metatype: UpdateSolicitudeDto },
        );
        expect(dto).toBeInstanceOf(UpdateSolicitudeDto);
        expect(dto).toMatchObject({ estado: 'Rechazado', motivo_rechazo: 'Equipo en mantenimiento' });
      });

      it.each([
        ['ausente', undefined],
        ['null', null],
        ['un número', 1234567890],
        ['vacío', ''],
        ['solo espacios (el hueco de @MinLength)', ' '.repeat(12)],
        ['de 9 caracteres tras recortar', `   ${'x'.repeat(9)}   `],
        ['de 5 emojis (10 unidades de JavaScript: @MinLength lo aceptaba)', '🎬'.repeat(5)],
        ['de 501 caracteres', 'x'.repeat(501)],
      ])('rechaza un motivo %s con el mensaje del contrato', async (_caso, motivo_rechazo) => {
        const errores = await erroresDe({ ...rechazo, motivo_rechazo }, UpdateSolicitudeDto);
        expect(errores).toEqual([MENSAJE_MOTIVO_RECHAZO]);
      });

      it.each([
        ['de 10 caracteres', 'x'.repeat(10)],
        ['de 500 caracteres', 'x'.repeat(500)],
        ['de 10 emojis', '🎬'.repeat(10)],
      ])('acepta un motivo %s (límites exactos, contados como el motor)', async (_caso, motivo_rechazo) => {
        expect(await erroresDe({ ...rechazo, motivo_rechazo }, UpdateSolicitudeDto)).toEqual([]);
      });

      it.each([
        ['con otro destino', { estado: 'Validado', motivo_rechazo: 'no' }],
        ['sin estado', { motivo_rechazo: '   ' }],
      ])('sin "Rechazado" el pipe no valida el motivo (%s): el 400 del huérfano es de E5', async (_caso, cuerpo) => {
        expect(await erroresDe(cuerpo, UpdateSolicitudeDto)).toEqual([]);
      });
    });
  });

  describe('ProponerReprogramacionDto (Fase 5.4 · K1)', () => {
    const propuesta = {
      fecha_inicio: inicio.toISOString(),
      fecha_fin: fin.toISOString(),
      sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
      motivo: 'Mantenimiento preventivo del set de grabación',
    };

    it('acepta la franja propuesta con zona horaria, el sub-espacio y el motivo', async () => {
      expect(await erroresDe(propuesta, ProponerReprogramacionDto)).toEqual([]);
    });

    describe('sub_espacio (Fase 7 · ADR-007 SE6): obligatorio, sin valor por defecto', () => {
      it.each(Object.values(SubEspacio))('acepta %s', async (subEspacio) => {
        expect(await erroresDe({ ...propuesta, sub_espacio: subEspacio }, ProponerReprogramacionDto)).toEqual([]);
      });

      it.each([
        ['ausente', undefined],
        ['null', null],
        ['inventado', 'SALA_3'],
        ['con otra capitalización', 'cabina_audio'],
      ])('rechaza un sub_espacio %s con el mensaje del contrato', async (_caso, subEspacio) => {
        const errores = await erroresDe({ ...propuesta, sub_espacio: subEspacio }, ProponerReprogramacionDto);
        expect(errores).toEqual([MENSAJE_SUBESPACIO_PROPUESTO]);
      });
    });

    it('rechaza con 400 un estado o un id_usuario colados en el comando', async () => {
      const errores = await erroresDe(
        { ...propuesta, estado: 'Validado', id_usuario: 'uuid-ajeno' },
        ProponerReprogramacionDto,
      );
      expect(errores).toEqual(
        expect.arrayContaining(['property estado should not exist', 'property id_usuario should not exist']),
      );
    });

    it('rechaza una fecha sin zona horaria (D-W)', async () => {
      const errores = await erroresDe({ ...propuesta, fecha_inicio: '2026-10-28T09:00:00' }, ProponerReprogramacionDto);
      expect(errores.join(' ')).toContain('fecha_inicio debe ser una fecha ISO 8601 real con zona horaria');
    });

    it('exige las dos fechas de la propuesta', async () => {
      const errores = await erroresDe(
        { fecha_inicio: propuesta.fecha_inicio, motivo: propuesta.motivo },
        ProponerReprogramacionDto,
      );
      expect(errores.join(' ')).toContain('fecha_fin');
    });

    describe('motivo (Fase 6.1b · K7, DB2 y DB3)', () => {
      it('entrega el motivo recortado: el log guarda exactamente lo que se validó', async () => {
        const dto = (await pipe.transform(
          { ...propuesta, motivo: '   Mantenimiento del set   ' },
          { type: 'body', metatype: ProponerReprogramacionDto },
        )) as ProponerReprogramacionDto;
        expect(dto.motivo).toBe('Mantenimiento del set');
      });

      it.each([
        ['ausente', undefined],
        ['null', null],
        ['un número', 1234567890],
        ['vacío', ''],
        ['solo espacios', ' '.repeat(12)],
        ['de 9 caracteres tras recortar', `   ${'x'.repeat(9)}   `],
        ['de 9 emojis (18 unidades de JavaScript)', '🎬'.repeat(9)],
        ['de 501 caracteres', 'x'.repeat(501)],
      ])('rechaza un motivo %s con el mensaje del contrato', async (_caso, motivo) => {
        const errores = await erroresDe({ ...propuesta, motivo }, ProponerReprogramacionDto);
        expect(errores).toEqual([MENSAJE_MOTIVO_REPROGRAMACION]);
      });

      it.each([
        ['de 10 caracteres', 'x'.repeat(10)],
        ['de 500 caracteres', 'x'.repeat(500)],
        ['de 10 emojis', '🎬'.repeat(10)],
      ])('acepta un motivo %s (límites exactos, contados como el motor)', async (_caso, motivo) => {
        expect(await erroresDe({ ...propuesta, motivo }, ProponerReprogramacionDto)).toEqual([]);
      });
    });
  });
});
