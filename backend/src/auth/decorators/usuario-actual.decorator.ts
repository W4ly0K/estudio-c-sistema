import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { RequestAutenticado } from '../interfaces/request-autenticado.interface';
import { UsuarioAutenticado } from '../interfaces/usuario-autenticado.interface';

/**
 * Inyecta la identidad verificada por JwtStrategy.validate().
 * Fail-closed: si no hay usuario en la petición, responde 401.
 */
export const UsuarioActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
    const request = ctx.switchToHttp().getRequest<RequestAutenticado>();
    const usuario = request.user;

    if (!usuario) {
      throw new UnauthorizedException('No hay una identidad autenticada en la petición.');
    }

    return usuario;
  },
);
