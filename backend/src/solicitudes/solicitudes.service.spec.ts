import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CategoriaSolicitud, Log_Auditoria, Solicitud } from '@prisma/client';
import { MENSAJE_SOLICITUD_NO_ENCONTRADA, SolicitudesService } from './solicitudes.service';
import {
  DetalleSolicitudSolicitante,
  SELECT_DETALLE_SOLICITANTE,
  SELECT_DETALLE_STAFF,
} from './proyecciones/detalle-solicitud.proyeccion';
import { USUARIO_SOLICITANTE, USUARIO_STAFF } from '../../test/utils/contexto-http.mock';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';
import { type ErrorHorario, MENSAJES_ERROR_HORARIO } from './reglas/horario.validator';
import { RelojFijo } from '../../test/utils/reloj-fijo';

/** "Ahora" fijo: lunes 5 de octubre de 2026, 10:00 en Bogotá. Mínima sin urgencia: miércoles 14. */
const AHORA = new Date('2026-10-05T10:00:00-05:00');

const solicitudBase: Solicitud = {
  radicado: 'EC-2099-0001',
  id_usuario: 'uuid-solicitante',
  categoria: CategoriaSolicitud.ESPACIOS,
  proposito: 'Grabación de clase magistral',
  num_participantes: null,
  // Fase 3: instantes con zona horaria explícita (jueves 15 de enero de 2099, 9:00–10:00 en Bogotá)
  fecha_inicio: new Date('2099-01-15T09:00:00-05:00'),
  fecha_fin: new Date('2099-01-15T10:00:00-05:00'),
  fecha_propuesta_inicio: null,
  fecha_propuesta_fin: null,
  estado: 'Recibido',
  es_urgencia: false,
};

// Test de COMPILACIÓN (Decisión I): si alguien agrega modificado_por a la proyección del
// solicitante, esta línea deja de ser un error de tipos → @ts-expect-error queda sin usar → tsc falla.
// @ts-expect-error — el solicitante no debe recibir la identidad del Staff
type _SinAutorStaff = DetalleSolicitudSolicitante['logs'][number]['modificado_por'];

const logBase: Log_Auditoria = {
  id_log: 'uuid-log',
  radicado_solicitud: 'EC-2099-0001',
  estado_anterior: 'Recibido',
  estado_nuevo: 'Rechazado',
  modificado_por: 'uuid-staff',
  fecha_modificacion: new Date(),
  motivo_rechazo: 'Equipo en mantenimiento preventivo',
};

describe('SolicitudesService', () => {
  const prismaMock = {
    solicitud: {
      findFirst: jest.fn<Promise<Solicitud | null>, [unknown]>(),
      findUnique: jest.fn<Promise<Solicitud | null>, [unknown]>(),
      findMany: jest.fn<Promise<Solicitud[]>, [unknown]>(),
      create: jest.fn<Promise<Solicitud>, [unknown]>(),
      update: jest.fn<Promise<Solicitud>, [unknown]>(),
    },
    log_Auditoria: { create: jest.fn<Promise<Log_Auditoria>, [unknown]>() },
    $transaction: jest.fn<Promise<[Solicitud, Log_Auditoria]>, [unknown]>(),
  };

  let service: SolicitudesService;
  let reloj: RelojFijo;

  beforeEach(() => {
    prismaMock.solicitud.findFirst.mockReset();
    prismaMock.solicitud.findUnique.mockReset();
    prismaMock.solicitud.findMany.mockReset();
    prismaMock.solicitud.create.mockReset();
    prismaMock.solicitud.update.mockReset();
    prismaMock.log_Auditoria.create.mockReset();
    prismaMock.$transaction.mockReset();
    reloj = new RelojFijo(AHORA);
    service = new SolicitudesService(prismaMock as unknown as PrismaService, reloj);
  });

  it('create() persiste como id_usuario el identificador recibido del token', async () => {
    const dto: CreateSolicitudeDto = {
      categoria: CategoriaSolicitud.ESPACIOS,
      proposito: solicitudBase.proposito,
      fecha_inicio: solicitudBase.fecha_inicio,
      fecha_fin: solicitudBase.fecha_fin,
    };
    prismaMock.solicitud.findFirst.mockResolvedValue(null);
    prismaMock.solicitud.create.mockResolvedValue(solicitudBase);

    await service.create(dto, 'uuid-del-token');

    expect(prismaMock.solicitud.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id_usuario: 'uuid-del-token', estado: 'Recibido' }),
      }),
    );
  });

  describe('create() — reglas de horario integradas (Fase 3)', () => {
    const dtoEntre = (inicio: string, fin: string): CreateSolicitudeDto => ({
      categoria: CategoriaSolicitud.ESPACIOS,
      proposito: solicitudBase.proposito,
      fecha_inicio: new Date(inicio),
      fecha_fin: new Date(fin),
    });

    beforeEach(() => {
      prismaMock.solicitud.findFirst.mockResolvedValue(null);
      prismaMock.solicitud.create.mockResolvedValue(solicitudBase);
    });

    /**
     * Record sobre la unión: si se agrega un código de error y no se le da un
     * caso aquí, tsc falla (la misma idea que la Decisión D-Q).
     */
    const CASO_POR_ERROR: Record<ErrorHorario, readonly [string, string]> = {
      FIN_NO_POSTERIOR: ['2026-10-27T10:00:00-05:00', '2026-10-27T09:00:00-05:00'],
      EN_EL_PASADO: ['2026-10-05T09:00:00-05:00', '2026-10-05T11:00:00-05:00'],
      MULTIPLES_DIAS: ['2026-10-27T17:00:00-05:00', '2026-10-28T09:00:00-05:00'],
      DIA_NO_HABIL: ['2026-10-12T09:00:00-05:00', '2026-10-12T10:00:00-05:00'],
      FUERA_DE_BLOQUE: ['2026-10-27T08:00:00Z', '2026-10-27T10:00:00Z'], // 03:00–05:00 en Bogotá
    };

    it.each(Object.entries(CASO_POR_ERROR) as [ErrorHorario, readonly [string, string]][])(
      '%s → 400 con su mensaje, SIN consultar la BD (CA-04 antes que CA-06)',
      async (codigo, [inicio, fin]) => {
        const intento = service.create(dtoEntre(inicio, fin), 'uuid-del-token');

        await expect(intento).rejects.toBeInstanceOf(BadRequestException);
        await expect(intento).rejects.toThrow(MENSAJES_ERROR_HORARIO[codigo]);
        expect(prismaMock.solicitud.findFirst).not.toHaveBeenCalled();
        expect(prismaMock.solicitud.create).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['martes 13: último día urgente', '2026-10-13', true],
      ['miércoles 14: fecha mínima sin urgencia', '2026-10-14', false],
    ])('es_urgencia según el Reloj inyectado: %s → %s', async (_caso, dia, urgente) => {
      await service.create(
        dtoEntre(`${dia}T14:00:00-05:00`, `${dia}T15:00:00-05:00`),
        'uuid-del-token',
      );

      expect(prismaMock.solicitud.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ es_urgencia: urgente }) }),
      );
    });

    it('consulta el Reloj UNA sola vez por petición (D-U)', async () => {
      const espia = jest.spyOn(reloj, 'ahora');

      await service.create(
        dtoEntre('2026-10-27T09:00:00-05:00', '2026-10-27T10:00:00-05:00'),
        'uuid-del-token',
      );

      expect(espia).toHaveBeenCalledTimes(1);
    });

    it('el año del radicado es el de Bogotá: 31/12 a las 20:00 ya es 2027 en UTC', async () => {
      reloj.fijar(new Date('2026-12-31T20:00:00-05:00'));

      await service.create(
        dtoEntre('2027-01-12T09:00:00-05:00', '2027-01-12T10:00:00-05:00'),
        'uuid-del-token',
      );

      expect(prismaMock.solicitud.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ radicado: expect.stringMatching(/^EC-2026-\d{4}$/) }),
        }),
      );
    });

    it('con una franja válida sí evalúa CA-06 y respeta el conflicto', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue(solicitudBase);

      await expect(
        service.create(
          dtoEntre('2026-10-27T09:00:00-05:00', '2026-10-27T10:00:00-05:00'),
          'uuid-del-token',
        ),
      ).rejects.toThrow('Error CA-06');
      expect(prismaMock.solicitud.create).not.toHaveBeenCalled();
    });
  });

  it('findMisSolicitudes() filtra por el identificador del token (aislamiento de datos)', async () => {
    prismaMock.solicitud.findMany.mockResolvedValue([solicitudBase]);

    await service.findMisSolicitudes('uuid-del-token');

    expect(prismaMock.solicitud.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_usuario: 'uuid-del-token' } }),
    );
  });

  describe('update() con cambio de estado (auditoría CA-09)', () => {
    beforeEach(() => {
      prismaMock.solicitud.findUnique.mockResolvedValue(solicitudBase);
      prismaMock.solicitud.update.mockResolvedValue({ ...solicitudBase, estado: 'Rechazado' });
      prismaMock.log_Auditoria.create.mockResolvedValue(logBase);
      prismaMock.$transaction.mockResolvedValue([
        { ...solicitudBase, estado: 'Rechazado' },
        logBase,
      ]);
    });

    it('registra como autor el idStaff verificado, con estados y motivo correctos', async () => {
      const dto: UpdateSolicitudeDto = {
        estado: 'Rechazado',
        motivo_rechazo: 'Equipo en mantenimiento preventivo',
      };

      await service.update('EC-2099-0001', dto, 'uuid-staff');

      expect(prismaMock.log_Auditoria.create).toHaveBeenCalledWith({
        data: {
          radicado_solicitud: 'EC-2099-0001',
          estado_anterior: 'Recibido',
          estado_nuevo: 'Rechazado',
          modificado_por: 'uuid-staff',
          motivo_rechazo: 'Equipo en mantenimiento preventivo',
        },
      });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('defensa en profundidad: ignora un autor inyectado aunque el DTO se haya saltado el pipe', async () => {
      const dtoContaminado = {
        estado: 'Validado',
        modificado_por: 'uuid-atacante',
      } as unknown as UpdateSolicitudeDto;

      await service.update('EC-2099-0001', dtoContaminado, 'uuid-staff');

      expect(prismaMock.log_Auditoria.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ modificado_por: 'uuid-staff' }),
      });
      expect(JSON.stringify(prismaMock.log_Auditoria.create.mock.calls)).not.toContain(
        'uuid-atacante',
      );
    });
  });
  describe('findOne() — propiedad, proyección por rol y 404 uniforme (Fase 2)', () => {
    interface ArgsFindFirst {
      where: unknown;
      select: unknown;
    }
    const argsDeFindFirst = (): ArgsFindFirst =>
      prismaMock.solicitud.findFirst.mock.calls[0][0] as ArgsFindFirst;

    it('SOLICITANTE: filtra por su id en el WHERE y usa la proyección mínima', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue(solicitudBase);

      await service.findOne('EC-2099-0001', USUARIO_SOLICITANTE);

      const args = argsDeFindFirst();
      expect(args.where).toEqual({ radicado: 'EC-2099-0001', id_usuario: USUARIO_SOLICITANTE.id });
      expect(args.select).toBe(SELECT_DETALLE_SOLICITANTE);
    });

    it('STAFF: consulta sin filtro de propiedad y usa la proyección completa', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue(solicitudBase);

      await service.findOne('EC-2099-0001', USUARIO_STAFF);

      const args = argsDeFindFirst();
      expect(args.where).toEqual({ radicado: 'EC-2099-0001' });
      expect(args.select).toBe(SELECT_DETALLE_STAFF);
    });

    it('sin resultado responde 404 con mensaje genérico, sin reflejar el radicado', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue(null);

      const error: unknown = await service
        .findOne('EC-2099-9999', USUARIO_SOLICITANTE)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe(MENSAJE_SOLICITUD_NO_ENCONTRADA);
      expect((error as NotFoundException).message).not.toContain('EC-2099-9999');
    });

    it('la proyección del solicitante no expone identidades internas ni inventario', () => {
      expect(SELECT_DETALLE_SOLICITANTE).not.toHaveProperty('usuario');
      expect(SELECT_DETALLE_SOLICITANTE).not.toHaveProperty('id_usuario');
      expect(SELECT_DETALLE_SOLICITANTE.logs.select).not.toHaveProperty('modificado_por');
      expect(SELECT_DETALLE_SOLICITANTE.logs.select).not.toHaveProperty('id_log');
      expect(SELECT_DETALLE_SOLICITANTE.recursos.select.recurso.select).not.toHaveProperty(
        'cantidad_total',
      );
    });
  });
});
