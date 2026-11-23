import { ValidationPipe } from '@nestjs/common';

/**
 * Fuente ÚNICA de la configuración de validación global.
 * La usan main.ts, los tests unitarios y el e2e: así un test nunca prueba
 * una configuración distinta a la que corre en producción (evita deriva silenciosa).
 */
export function crearValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true, // Campo desconocido → 400 (visible), no descarte silencioso
    transform: true, // Convierte los textos ISO a Date reales
  });
}
