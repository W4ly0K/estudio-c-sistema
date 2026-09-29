import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

/**
 * Autenticación JWT. Registrado como APP_GUARD global: todo endpoint exige
 * token salvo los marcados explícitamente con @Public() (denegar por defecto).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return esPublica ? true : super.canActivate(context);
  }

  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    // Solo mensajes breves: los logs no deben filtrar detalles internos ni tokens.
    if (info instanceof Error) {
      this.logger.warn(`JWT rechazado: ${info.message}`);
    }

    if (err instanceof Error) {
      this.logger.warn(`Fallo de autenticación: ${err.name}`);
    }

    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException('Acceso denegado por JWT');
    }

    return user;
  }
}
