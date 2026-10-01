import { BadRequestException, Type } from '@nestjs/common';
import { CategoriaSolicitud } from '@prisma/client';
import { crearValidationPipe } from '../../common/pipes/crear-validation-pipe';
import { CreateSolicitudeDto } from './create-solicitude.dto';
import { UpdateSolicitudeDto } from './update-solicitude.dto';

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
  });

  describe('UpdateSolicitudeDto', () => {
    it('acepta un cambio de estado válido', async () => {
      expect(await erroresDe({ estado: 'Validado' }, UpdateSolicitudeDto)).toEqual([]);
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
      expect(errores).toEqual(
        expect.arrayContaining([expect.stringContaining('motivo de rechazo es obligatorio')]),
      );
    });

    it('rechaza motivos de relleno (menos de 10 caracteres)', async () => {
      const errores = await erroresDe(
        { estado: 'Rechazado', motivo_rechazo: 'no' },
        UpdateSolicitudeDto,
      );
      expect(errores).toEqual(
        expect.arrayContaining([expect.stringContaining('motivo de rechazo es obligatorio')]),
      );
    });
  });
});
