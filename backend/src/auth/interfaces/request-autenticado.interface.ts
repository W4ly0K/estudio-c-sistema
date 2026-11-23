import type { Request } from 'express';
import { UsuarioAutenticado } from './usuario-autenticado.interface';

/**
 * Request de Express tras pasar por JwtStrategy.validate().
 * Fuente única del tipo para decoradores y guards.
 */
export interface RequestAutenticado extends Request {
  user?: UsuarioAutenticado;
}
