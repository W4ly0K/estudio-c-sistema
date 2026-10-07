import { Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { crearContextoHttp, USUARIO_STAFF } from '../../test/utils/contexto-http.mock';

// `this: void`: Nest entrega el handler sin ligar (getHandler) y Reflector solo
// usa su identidad; estos métodos nunca usan `this` (unbound-method).
class ControladorPrueba {
  @Public()
  login(this: void): void {}

  protegido(this: void): void {}
}

// AuthGuard('jwt') está memoizado en @nestjs/passport: es la MISMA clase padre de JwtAuthGuard.
const GuardPassport = AuthGuard('jwt');

// Silencia Logger.warn y devuelve el espía: las aserciones van sobre el espía y no
// sobre Logger.prototype.warn, que es un método sin `this` ligado (unbound-method).
function silenciarWarn() {
  return jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let warn: ReturnType<typeof silenciarWarn>;

  beforeEach(() => {
    guard = new JwtAuthGuard(new Reflector());
    warn = silenciarWarn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('canActivate (denegar por defecto)', () => {
    it('permite rutas @Public() SIN consultar a Passport', () => {
      const passport = jest.spyOn(GuardPassport.prototype, 'canActivate').mockReturnValue(true);
      const ctx = crearContextoHttp({
        handler: ControladorPrueba.prototype.login,
        clase: ControladorPrueba,
      });

      expect(guard.canActivate(ctx)).toBe(true);
      expect(passport).not.toHaveBeenCalled();
    });

    it('delega en Passport (exige JWT) las rutas sin @Public()', () => {
      const passport = jest.spyOn(GuardPassport.prototype, 'canActivate').mockReturnValue(true);
      const ctx = crearContextoHttp({
        handler: ControladorPrueba.prototype.protegido,
        clase: ControladorPrueba,
      });

      expect(guard.canActivate(ctx)).toBe(true);
      expect(passport).toHaveBeenCalledTimes(1);
      expect(passport).toHaveBeenCalledWith(ctx);
    });
  });

  describe('handleRequest', () => {
    it('devuelve el usuario cuando la validación fue exitosa', () => {
      expect(guard.handleRequest(null, USUARIO_STAFF, undefined)).toBe(USUARIO_STAFF);
    });

    it('responde 401 si no hay usuario ni error (fail-closed)', () => {
      expect(() => guard.handleRequest(null, false, undefined)).toThrow(UnauthorizedException);
    });

    it('relanza la MISMA instancia de Error (conserva 401 de validate() o 500 de BD)', () => {
      const errorOriginal = new Error('Base de datos no disponible');
      let capturado: unknown;
      try {
        guard.handleRequest(errorOriginal, false, undefined);
      } catch (e) {
        capturado = e;
      }

      expect(capturado).toBe(errorOriginal);
      expect(warn).toHaveBeenCalledWith('Fallo de autenticación: Error');
    });

    it('nunca lanza valores crudos: un error que no es Error se convierte en 401', () => {
      expect(() => guard.handleRequest('fallo-crudo', false, undefined)).toThrow(
        UnauthorizedException,
      );
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
