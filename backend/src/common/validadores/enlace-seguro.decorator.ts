import { applyDecorators } from '@nestjs/common';
import { IsString, IsUrl, Matches, ValidateBy } from 'class-validator';
import { longitudReal } from './texto-con-longitud-real.decorator';

/**
 * Fase 9 · 9.1.1 · Fuente única de la FORMA de un enlace seguro: el producto final (Fase 8 ·
 * requisito 4) y el anexo del solicitante (Fase 9 · R9-1). El motor repite la regla en un CHECK
 * por columna, con la forma exacta:
 *   <columna> ~ '^https://[^[:space:]]+$' AND char_length(<columna>) <= ENLACE_MAXIMO
 * y enlace-seguro.decorator.spec.ts compara cada migración con estas constantes.
 *
 * Dirección obligatoria (DTO ⊆ CHECK): este validador puede ser MÁS estricto que el CHECK, nunca
 * más laxo (si el motor rechazara algo que el pipe aceptó, respondería 500). Hoy lo es: @IsUrl
 * exige dominio de primer nivel, prohíbe usuario y contraseña y, por su cuenta, rechaza más de 2084
 * unidades UTF-16 (max_allowed_length de validator). La longitud máxima se mide en puntos de código
 * con longitudReal(), la misma medida que char_length.
 *
 * Fase 9 · H8b: antes la medía @MaxLength, con isLength de validator, que cuenta un par sustituto como 1
 * pero DESCUENTA los selectores de variación U+FE0E y U+FE0F (char_length los cuenta). No contaba
 * unidades UTF-16, como decía este comentario: aceptaba enlaces de más de ENLACE_MAXIMO puntos de código
 * que el CHECK rechazaría.
 *
 * Fase 9 · H0 (P0, precheck 9.1.0b, fila 28): [:space:] del motor también rechaza U+001C a U+001F y
 * U+0085, que \s de JavaScript no reconoce, y @IsUrl solo revisa el dominio. Con \S el pipe los
 * aceptaba en la ruta, la consulta o el fragmento, y el CHECK respondía 500. Por eso el patrón excluye
 * además todo carácter de control (\p{Cc}: U+0000 a U+001F y U+007F a U+009F). Un enlace legítimo
 * los lleva codificados (%1C), y eso sigue aceptado. La prueba de P0 fue acotada a 35 candidatos.
 */
export const ENLACE_MAXIMO = 2048;

/**
 * Prefijo exacto en minúsculas, sin espacios (\s) ni caracteres de control (\p{Cc}): más estricto que
 * '^https://[^[:space:]]+$' del CHECK. \p{Cc} evita escribir controles literales (no-control-regex).
 */
export const PATRON_ENLACE_SEGURO = /^https:\/\/[^\s\p{Cc}]+$/u;

/**
 * Fase 9 · H8b · char_length(<columna>) <= ENLACE_MAXIMO, en puntos de código y sin recortar (el patrón ya
 * rechaza los espacios). Lo que no es texto falla, como fallaba @MaxLength: la cantidad de mensajes no cambia.
 */
function cabeEnElLimiteDelMotor(valor: unknown): boolean {
  return typeof valor === 'string' && longitudReal(valor) <= ENLACE_MAXIMO;
}

/**
 * Solo la forma. Si el campo es opcional lo decide cada DTO con su @IsOptional(): sin él,
 * null o ausente se rechazan. Un solo mensaje para cualquier falla.
 */
export function EnlaceSeguro(mensaje: string): PropertyDecorator {
  return applyDecorators(
    IsString({ message: mensaje }),
    ValidateBy(
      { name: 'enlaceHastaEnlaceMaximo', constraints: [ENLACE_MAXIMO], validator: { validate: cabeEnElLimiteDelMotor } },
      { message: mensaje },
    ),
    Matches(PATRON_ENLACE_SEGURO, { message: mensaje }),
    IsUrl(
      { protocols: ['https'], require_protocol: true, require_tld: true, disallow_auth: true },
      { message: mensaje },
    ),
  );
}
