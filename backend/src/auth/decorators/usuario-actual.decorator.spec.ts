import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { UsuarioActual } from './usuario-actual.decorator';
import type { UsuarioAutenticado } from '../interfaces/usuario-autenticado.interface';
import { crearContextoHttp, USUARIO_STAFF } from '../../../test/utils/contexto-http.mock';

type FabricaParametro = (data: unknown, ctx: ExecutionContext) => UsuarioAutenticado;

/**
 * Un decorador de parámetro no se invoca directamente: se aplica sobre una clase
 * de prueba y se extrae la fábrica que NestJS registró en los metadatos de la ruta.
 * (import type arriba: el tipo aparece en una firma decorada — lección del paso 1.5)
 */
function obtenerFabrica(): FabricaParametro {
  class Prueba {
    metodo(@UsuarioActual() _usuario: UsuarioAutenticado): void {}
  }
  const metadatos = Reflect.getMetadata(ROUTE_ARGS_METADATA, Prueba, 'metodo') as Record<
    string,
    { factory: FabricaParametro }
  >;
  return Object.values(metadatos)[0].factory;
}

describe('@UsuarioActual()', () => {
  const fabrica = obtenerFabrica();

  it('devuelve exactamente la identidad verificada del request', () => {
    const ctx = crearContextoHttp({ usuario: USUARIO_STAFF });
    expect(fabrica(undefined, ctx)).toBe(USUARIO_STAFF);
  });

  it('responde 401 si no hay identidad: evita where { id_usuario: undefined } en Prisma', () => {
    const ctx = crearContextoHttp();
    expect(() => fabrica(undefined, ctx)).toThrow(UnauthorizedException);
  });
});
