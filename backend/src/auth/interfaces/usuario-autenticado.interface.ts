import { RolUsuario } from '@prisma/client';

/**
 * Identidad verificada de la petición actual.
 * Se construye ÚNICAMENTE en JwtStrategy.validate() a partir de la BD.
 */
export interface UsuarioAutenticado {
  readonly id: string;
  readonly correo: string;
  readonly rol: RolUsuario;
}
