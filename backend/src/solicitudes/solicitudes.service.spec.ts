import { CategoriaSolicitud, Log_Auditoria, Solicitud } from '@prisma/client';
import { SolicitudesService } from './solicitudes.service';
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
});
