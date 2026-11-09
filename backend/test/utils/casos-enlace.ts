/**
 * Fase 9 · 9.1.1 · Casos de forma del enlace seguro, compartidos por las pruebas del decorador,
 * de los DTOs y de integración (una sola copia: lección 6 de la Fase 8). Las listas documentan la
 * dirección DTO ⊆ CHECK: lo que rechaza el motor también lo rechaza el pipe, pero no al revés.
 */

/** Formas que el pipe y el motor aceptan. */
export const ENLACES_ACEPTADOS: readonly string[] = [
  'https://youtu.be/abc123',
  'https://drive.google.com/file/d/xyz/view?usp=sharing',
  'https://docs.google.com/document/d/abc/edit',
  'https://repositorio.unicesmag.edu.co/handle/123/456',
];

/** Los rechazan el pipe Y el CHECK del motor. */
export const ENLACES_RECHAZADOS_POR_EL_MOTOR: readonly (readonly [string, string])[] = [
  ['vacío', ''],
  ['espacio al inicio', ' https://youtu.be/abc123'],
  ['espacio al final', 'https://youtu.be/abc123 '],
  ['con espacios', 'https://youtu.be/abc 123'],
  ['http (sin cifrar)', 'http://youtu.be/abc123'],
  ['HTTPS en mayúsculas (el CHECK es exacto)', 'HTTPS://youtu.be/abc123'],
  ['https:// sin destino', 'https://'],
  ['javascript:', 'javascript:alert(1)'],
  ['data:', 'data:text/html,<script>alert(1)</script>'],
  ['ftp', 'ftp://ejemplo.com/video.mp4'],
];

/** Solo los rechaza el pipe (@IsUrl): el CHECK los dejaría pasar. Por eso el pipe va primero. */
export const ENLACES_RECHAZADOS_SOLO_POR_EL_DTO: readonly (readonly [string, string])[] = [
  ['con usuario y contraseña', 'https://usuario:clave@ejemplo.com/video'],
  ['sin dominio de primer nivel', 'https://intranet/video'],
];

const PREFIJO_LARGO = 'https://ejemplo.com/';

/** Un enlace válido de exactamente `longitud` caracteres (longitud > largo del prefijo). */
export const enlaceDeLongitud = (longitud: number): string =>
  `${PREFIJO_LARGO}${'a'.repeat(longitud - PREFIJO_LARGO.length)}`;
