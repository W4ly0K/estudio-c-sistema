import { NotFoundException } from '@nestjs/common';
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

const solicitudBase: Solicitud = {
  radicado: 'EC-2099-0001',
  id_usuario: 'uuid-solicitante',
  categoria: CategoriaSolicitud.ESPACIOS,
  proposito: 'Grabación de clase magistral',
  num_participantes: null,
  // Hora LOCAL (9:00–10:00): la regla CA-04 actual usa getHours(), que depende de la zona horaria
  fecha_inicio: new Date(2099, 0, 15, 9, 0),
  fecha_fin: new Date(2099, 0, 15, 10, 0),
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

  beforeEach(() => {
    prismaMock.solicitud.findFirst.mockReset();
    prismaMock.solicitud.findUnique.mockReset();
    prismaMock.solicitud.findMany.mockReset();
    prismaMock.solicitud.create.mockReset();
    prismaMock.solicitud.update.mockReset();
    prismaMock.log_Auditoria.create.mockReset();
    prismaMock.$transaction.mockReset();
    service = new SolicitudesService(prismaMock as unknown as PrismaService);
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
