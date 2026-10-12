import type { RolUsuario } from '@prisma/client';

/**
 * Identidad pública del usuario para el frontend (Fase 6.2 · DS1).
 * Es la MISMA forma en la respuesta del login y en GET /auth/perfil: el frontend la
 * valida con un único esquema. Sin el correo: la interfaz no lo necesita (minimización).
 */
export interface PerfilUsuario {
  readonly id: string;
  readonly nombre: string;
  readonly rol: RolUsuario;
}
