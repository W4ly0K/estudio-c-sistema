import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Excepción explícita a la política global "denegar por defecto".
 * Úsese solo en endpoints que por diseño no requieren identidad (ej. login).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
