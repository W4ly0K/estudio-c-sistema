import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { RolUsuario } from '@prisma/client';
import { AuthService, MENSAJE_PERFIL_SIN_USUARIO, SELECT_PERFIL } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  const prismaMock = { usuario: { findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('obtenerPerfil() — GET /auth/perfil (Fase 6.2 · DS1)', () => {
    it('P-1 · lee el perfil con la lista blanca de columnas: sin el correo', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({ id_usuario: 'uuid-1', nombre: 'Ana Pérez', rol: RolUsuario.STAFF });

      const perfil = await service.obtenerPerfil('uuid-1');

      expect(perfil).toEqual({ id: 'uuid-1', nombre: 'Ana Pérez', rol: RolUsuario.STAFF });
      expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({ where: { id_usuario: 'uuid-1' }, select: SELECT_PERFIL });
      expect(SELECT_PERFIL).toEqual({ id_usuario: true, nombre: true, rol: true });
    });

    it('P-2 · solo copia los campos del perfil, aunque la fila trajera más', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({
        id_usuario: 'uuid-1',
        nombre: 'Ana Pérez',
        rol: RolUsuario.SOLICITANTE,
        correo: 'ana@unicesmag.edu.co',
      });

      expect(Object.keys(await service.obtenerPerfil('uuid-1')).sort()).toEqual(['id', 'nombre', 'rol']);
    });

    it('P-3 · usuario eliminado entre la validación del token y la consulta → 401 (fail-closed)', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      await expect(service.obtenerPerfil('uuid-borrado')).rejects.toEqual(
        new UnauthorizedException(MENSAJE_PERFIL_SIN_USUARIO),
      );
    });
  });
});
