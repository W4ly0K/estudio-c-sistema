import { applyDecorators } from '@nestjs/common';
import { IsString, IsUrl, Matches, MaxLength } from 'class-validator';

/**
 * Fase 9 · 9.1.1 · Fuente única de la FORMA de un enlace seguro: el producto final (Fase 8 ·
 * requisito 4) y el anexo del solicitante (Fase 9 · R9-1). El motor repite la regla en un CHECK
 * por columna, con la forma exacta:
 *   <columna> ~ '^https://[^[:space:]]+$' AND char_length(<columna>) <= ENLACE_MAXIMO
 * y enlace-seguro.decorator.spec.ts compara cada migración con estas constantes.
 *
 * Dirección obligatoria (DTO ⊆ CHECK): este validador puede ser MÁS estricto que el CHECK, nunca
 * más laxo (si el motor rechazara algo que el pipe aceptó, respondería 500). Hoy lo es: @IsUrl
 * exige dominio de primer nivel y prohíbe usuario y contraseña, y MaxLength cuenta unidades UTF-16,
 * que nunca son menos que los caracteres que cuenta char_length.
 */
export const ENLACE_MAXIMO = 2048;

/** Prefijo exacto en minúsculas y sin espacios: el par de '^https://[^[:space:]]+$' del CHECK. */
export const PATRON_ENLACE_SEGURO = /^https:\/\/\S+$/;

/**
 * Solo la forma. Si el campo es opcional lo decide cada DTO con su @IsOptional(): sin él,
 * null o ausente se rechazan. Un solo mensaje para cualquier falla.
 */
export function EnlaceSeguro(mensaje: string): PropertyDecorator {
  return applyDecorators(
    IsString({ message: mensaje }),
    MaxLength(ENLACE_MAXIMO, { message: mensaje }),
    Matches(PATRON_ENLACE_SEGURO, { message: mensaje }),
    IsUrl(
      { protocols: ['https'], require_protocol: true, require_tld: true, disallow_auth: true },
      { message: mensaje },
    ),
  );
}
