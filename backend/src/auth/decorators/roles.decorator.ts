import { SetMetadata } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint (o controlador) a uno o más roles.
 * La tupla obliga a declarar al menos un rol: `@Roles()` vacío no compila.
 */
export const Roles = (...roles: [RolUsuario, ...RolUsuario[]]) => SetMetadata(ROLES_KEY, roles);
