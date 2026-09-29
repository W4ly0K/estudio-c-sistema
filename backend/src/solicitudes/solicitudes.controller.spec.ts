import { Reflector } from '@nestjs/core';
import { CategoriaSolicitud, RolUsuario, Solicitud } from '@prisma/client';
import { SolicitudesController } from './solicitudes.controller';
import { SolicitudesService } from './solicitudes.service';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { USUARIO_SOLICITANTE, USUARIO_STAFF } from '../../test/utils/contexto-http.mock';

type MetodoControlador =
  | 'create'
  | 'findMisSolicitudes'
  | 'findAll'
  | 'findOne'
  | 'update'
  | 'remove';

const reflector = new Reflector();
const metadatoDe = <T>(clave: string, metodo: MetodoControlador): T | undefined =>
  reflector.getAllAndOverride<T | undefined>(clave, [
    SolicitudesController.prototype[metodo],
    SolicitudesController,
  ]);

describe('SolicitudesController', () => {
  describe('Autorización declarada (@Roles / @Public)', () => {
    it.each<MetodoControlador>(['findAll', 'findOne', 'update', 'remove'])(
      '%s exige el rol STAFF',
      (metodo) => {
        expect(metadatoDe<RolUsuario[]>(ROLES_KEY, metodo)).toEqual([RolUsuario.STAFF]);
      },
    );

    it.each<MetodoControlador>(['create', 'findMisSolicitudes'])(
      '%s no exige rol (basta con estar autenticado)',
      (metodo) => {
        expect(metadatoDe<RolUsuario[]>(ROLES_KEY, metodo)).toBeUndefined();
      },
    );

    it('ningún endpoint ni la clase es @Public() (denegar por defecto)', () => {
      const metodos: MetodoControlador[] = [
        'create',
        'findMisSolicitudes',
        'findAll',
        'findOne',
        'update',
        'remove',
      ];
      for (const metodo of metodos) {
        expect(metadatoDe<boolean>(IS_PUBLIC_KEY, metodo)).toBeUndefined();
      }
    });
  });

  describe('Propagación de la identidad verificada', () => {
    const serviceMock = {
      create: jest.fn<Promise<Solicitud | null>, [CreateSolicitudeDto, string]>(),
      update: jest.fn<
        Promise<{ mensaje: string; solicitud: Solicitud } | null>,
        [string, UpdateSolicitudeDto, string]
      >(),
    };
    const controller = new SolicitudesController(serviceMock as unknown as SolicitudesService);

    it('create() entrega al servicio el id del usuario autenticado', async () => {
      serviceMock.create.mockResolvedValue(null);
      const dto: CreateSolicitudeDto = {
        categoria: CategoriaSolicitud.PODCAST,
        proposito: 'Episodio piloto',
        fecha_inicio: new Date(2099, 0, 15, 9, 0),
        fecha_fin: new Date(2099, 0, 15, 10, 0),
      };

      await controller.create(dto, USUARIO_SOLICITANTE);

      expect(serviceMock.create).toHaveBeenCalledWith(dto, USUARIO_SOLICITANTE.id);
    });

    it('update() entrega al servicio el id del Staff autenticado como autor', async () => {
      serviceMock.update.mockResolvedValue(null);
      const dto: UpdateSolicitudeDto = { estado: 'Validado' };

      await controller.update('EC-2099-0001', dto, USUARIO_STAFF);

      expect(serviceMock.update).toHaveBeenCalledWith('EC-2099-0001', dto, USUARIO_STAFF.id);
    });
  });
});
