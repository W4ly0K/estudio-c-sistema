/**
 * Fase 9 · 9.1.1 · Casos de forma del enlace seguro, compartidos por las pruebas del decorador,
 * de los DTOs y de integración (una sola copia: lección 6 de la Fase 8). Las listas documentan la
 * dirección DTO ⊆ CHECK: lo que rechaza el motor también lo rechaza el pipe, pero no al revés.
 */

/**
 * Fase 9 · H0 · Caracteres de control. Evidencia del motor: P0 (precheck 9.1.0b, filas 28 y 29, producción,
 * 2026-11-11) evaluó el patrón del CHECK (^https://[^[:space:]]+$) sobre 'https://a' || c || 'b': rechaza
 * U+001C a U+001F y U+0085, y acepta U+FEFF. El CHECK es una expresión regular sobre todo el texto, así que la
 * posición (ruta, consulta o fragmento) no cambia lo que hace el motor. @IsUrl solo revisa el dominio.
 */
const POSICIONES: readonly (readonly [string, (caracter: string) => string])[] = [
  ['en la ruta', (c) => `https://ejemplo.com/a${c}b`],
  ['en la consulta', (c) => `https://ejemplo.com/video?x=a${c}b`],
  ['en el fragmento', (c) => `https://ejemplo.com/video#a${c}b`],
];

const enCadaPosicion = (nombre: string, caracter: string): (readonly [string, string])[] =>
  POSICIONES.map(([posicion, construir]) => [`${nombre} ${posicion}`, construir(caracter)] as const);

/** Controles que el motor rechaza (P0, fila 28) y que \s de JavaScript no reconoce: antes de H0 el pipe los aceptaba. */
export const ENLACES_CON_CONTROL_RECHAZADOS_POR_EL_MOTOR: readonly (readonly [string, string])[] = (
  [
    ['U+001C', '\u001C'],
    ['U+001D', '\u001D'],
    ['U+001E', '\u001E'],
    ['U+001F', '\u001F'],
    ['U+0085', '\u0085'],
  ] as const
).flatMap(([nombre, caracter]) => enCadaPosicion(nombre, caracter));

/**
 * Controles que el pipe rechaza (\p{Cc}) pero que P0 no midió en el motor. Solo se prueban contra el DTO, nunca en
 * integración, hasta tener evidencia de lo que hace el motor con ellos.
 */
export const ENLACES_CON_CONTROL_SIN_EVIDENCIA_DEL_MOTOR: readonly (readonly [string, string])[] = (
  [
    ['U+007F', '\u007F'],
    ['U+009F', '\u009F'],
  ] as const
).flatMap(([nombre, caracter]) => enCadaPosicion(nombre, caracter));

/**
 * Los mismos controles codificados con %: texto ASCII válido en una URL, que el pipe acepta. Solo se prueban contra
 * el DTO; lo que hace el motor se verifica en la integración (H3).
 */
export const ENLACES_CODIFICADOS: readonly string[] = [
  'https://ejemplo.com/a%1Cb',
  'https://ejemplo.com/video?x=a%C2%85b',
  'https://ejemplo.com/video#a%1Fb',
];

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
  ...ENLACES_CON_CONTROL_RECHAZADOS_POR_EL_MOTOR,
];

/** Solo los rechaza el pipe (@IsUrl): el CHECK los dejaría pasar. Por eso el pipe va primero. */
export const ENLACES_RECHAZADOS_SOLO_POR_EL_DTO: readonly (readonly [string, string])[] = [
  ['con usuario y contraseña', 'https://usuario:clave@ejemplo.com/video'],
  ['sin dominio de primer nivel', 'https://intranet/video'],
  ['U+FEFF en la ruta (P0, fila 29: el motor lo acepta)', 'https://ejemplo.com/a\uFEFFb'],
];

const PREFIJO_LARGO = 'https://ejemplo.com/';

/** Un enlace válido de exactamente `longitud` caracteres (longitud > largo del prefijo). */
export const enlaceDeLongitud = (longitud: number): string =>
  `${PREFIJO_LARGO}${'a'.repeat(longitud - PREFIJO_LARGO.length)}`;
