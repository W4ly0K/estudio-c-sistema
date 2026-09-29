import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolUsuario } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestAutenticado } from '../interfaces/request-autenticado.interface';

/**
 * Autorización por rol. Se ejecuta DESPUÉS de JwtAuthGuard (orden en APP_GUARD).
 * 401 = no sé quién eres · 403 = sé quién eres, pero no tienes permiso.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<RolUsuario[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @Roles: basta con estar autenticado (lo garantiza JwtAuthGuard).
    if (!rolesRequeridos) {
      return true;
    }

    const usuario = context.switchToHttp().getRequest<RequestAutenticado>().user;
    if (!usuario) {
      throw new UnauthorizedException('Identidad no verificada.');
    }

    if (!rolesRequeridos.includes(usuario.rol)) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción.');
    }

    return true;
  }
}
