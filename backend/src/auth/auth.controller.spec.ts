import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RolUsuario } from '@prisma/client';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';
import type { PerfilUsuario } from './interfaces/perfil-usuario.interface';
import { USUARIO_SOLICITANTE } from '../../test/utils/contexto-http.mock';

const reflector = new Reflector();
const metadatoDe = <T>(clave: string, metodo: 'googleLogin' | 'perfil'): T | undefined =>
  reflector.getAllAndOverride<T | undefined>(clave, [AuthController.prototype[metodo], AuthController]);

describe('AuthController', () => {
  let controller: AuthController;
  const serviceMock = { obtenerPerfil: jest.fn<Promise<PerfilUsuario>, [string]>() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: serviceMock }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Autorización declarada (Fase 6.2 · DS1)', () => {
    it('solo el login es @Public()', () => {
      expect(metadatoDe<boolean>(IS_PUBLIC_KEY, 'googleLogin')).toBe(true);
      expect(metadatoDe<boolean>(IS_PUBLIC_KEY, 'perfil')).toBeUndefined();
    });

    it('perfil no exige rol: basta con estar autenticado', () => {
      expect(metadatoDe<RolUsuario[]>(ROLES_KEY, 'perfil')).toBeUndefined();
    });
  });

  it('perfil() consulta el perfil del usuario del TOKEN (Zero Trust)', async () => {
    const perfil: PerfilUsuario = { id: USUARIO_SOLICITANTE.id, nombre: 'Ana', rol: RolUsuario.SOLICITANTE };
    serviceMock.obtenerPerfil.mockResolvedValue(perfil);

    await expect(controller.perfil(USUARIO_SOLICITANTE)).resolves.toBe(perfil);
    expect(serviceMock.obtenerPerfil).toHaveBeenCalledWith(USUARIO_SOLICITANTE.id);
  });
});
