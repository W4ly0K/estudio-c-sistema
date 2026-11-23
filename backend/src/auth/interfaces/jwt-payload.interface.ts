import { RolUsuario } from '@prisma/client';

/**
 * Forma del JWT emitido por AuthService.
 * OJO: su `rol` es informativo (útil para la UI del frontend);
 * la autorización del backend NUNCA se decide con este campo.
 */
export interface JwtPayload {
  readonly sub: string;
  readonly correo: string;
  readonly rol: RolUsuario;
  readonly iat?: number;
  readonly exp?: number;
}
