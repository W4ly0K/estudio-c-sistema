import type { ExecutionContext, Type } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import type { UsuarioAutenticado } from '../../src/auth/interfaces/usuario-autenticado.interface';

/**
 * Utilidades SOLO para tests. Viven en test/ porque tsconfig.build.json
 * excluye esta carpeta: nunca llegan a dist/ ni a producción.
 */

export const USUARIO_STAFF: UsuarioAutenticado = {
  id: 'uuid-staff',
  correo: 'staff@unicesmag.edu.co',
  rol: RolUsuario.STAFF,
};

export const USUARIO_SOLICITANTE: UsuarioAutenticado = {
  id: 'uuid-solicitante',
  correo: 'estudiante@unicesmag.edu.co',
  rol: RolUsuario.SOLICITANTE,
};

interface OpcionesContexto {
  usuario?: UsuarioAutenticado;
  handler?: () => void;
  clase?: Type<unknown>;
}

/** Simula el ExecutionContext HTTP que NestJS entrega a guards y decoradores. */
export function crearContextoHttp(opciones: OpcionesContexto = {}): ExecutionContext {
  const request = { user: opciones.usuario };
  const contexto: Partial<ExecutionContext> = {
    getHandler: () => opciones.handler ?? (() => undefined),
    getClass: <T>() => (opciones.clase ?? class {}) as unknown as Type<T>,
    switchToHttp: () => ({
      getRequest: <T>() => request as unknown as T,
      getResponse: <T>() => ({}) as unknown as T,
      getNext: <T>() => (() => undefined) as unknown as T,
    }),
  };
  return contexto as ExecutionContext;
}
