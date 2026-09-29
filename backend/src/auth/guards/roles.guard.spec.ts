import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolUsuario } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { Roles } from '../decorators/roles.decorator';
import {
  crearContextoHttp,
  USUARIO_SOLICITANTE,
  USUARIO_STAFF,
} from '../../../test/utils/contexto-http.mock';

// Controladores de prueba con los decoradores REALES: se prueba decorador + guard juntos.
class ControladorMixto {
  publicoAutenticado(): void {}

  @Roles(RolUsuario.STAFF)
  soloStaff(): void {}
}

@Roles(RolUsuario.STAFF)
class ControladorStaff {
  heredaDeLaClase(): void {}

  @Roles(RolUsuario.SOLICITANTE)
  sobrescritoEnMetodo(): void {}
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('permite el acceso sin @Roles a cualquier usuario autenticado', () => {
    const ctx = crearContextoHttp({
      usuario: USUARIO_SOLICITANTE,
      handler: ControladorMixto.prototype.publicoAutenticado,
      clase: ControladorMixto,
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite el acceso cuando el rol coincide', () => {
    const ctx = crearContextoHttp({
      usuario: USUARIO_STAFF,
      handler: ControladorMixto.prototype.soloStaff,
      clase: ControladorMixto,
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('responde 403 (Forbidden) cuando el rol no coincide', () => {
    const ctx = crearContextoHttp({
      usuario: USUARIO_SOLICITANTE,
      handler: ControladorMixto.prototype.soloStaff,
      clase: ControladorMixto,
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('responde 401 (Unauthorized) si se exige rol y no hay identidad (fail-closed)', () => {
    const ctx = crearContextoHttp({
      handler: ControladorMixto.prototype.soloStaff,
      clase: ControladorMixto,
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('aplica el rol de la clase a los métodos sin @Roles propio', () => {
    const ctx = crearContextoHttp({
      usuario: USUARIO_SOLICITANTE,
      handler: ControladorStaff.prototype.heredaDeLaClase,
      clase: ControladorStaff,
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('da prioridad al @Roles del método sobre el de la clase (getAllAndOverride)', () => {
    const ctx = crearContextoHttp({
      usuario: USUARIO_SOLICITANTE,
      handler: ControladorStaff.prototype.sobrescritoEnMetodo,
      clase: ControladorStaff,
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
