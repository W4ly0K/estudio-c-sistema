/**
 * Fase 8 · requisito 4: el enlace del producto final, del lado de la vista. Se usa para dos
 * cosas: no ofrecer "Confirmar" con un enlace que el servidor rechazaría (DR5) y, sobre todo,
 * no pintar NUNCA un `href` que no sea https:// (javascript:, data:...). El servidor valida lo
 * mismo (DTO, servicio y CHECK); aquí es defensa en profundidad para lo que ya está guardado.
 */

/** El mismo límite del DTO y del CHECK (contrato.test.ts lo compara con el backend). */
export const ENLACE_MAXIMO = 2048

export const TEXTO_RAZON_ENLACE_VACIO = 'Para entregar, pega el enlace del producto final.'
export const TEXTO_RAZON_ENLACE_INVALIDO =
  'El enlace debe empezar por https:// (en minúsculas) y no llevar espacios ni usuario y contraseña.'

/**
 * ¿Se puede usar como `href`? Exige el prefijo exacto "https://" (como el CHECK del motor) y
 * que el navegador lo lea como una URL https con dominio y sin credenciales.
 */
export function esEnlaceSeguro(texto: string): boolean {
  if (!texto.startsWith('https://') || texto.length > ENLACE_MAXIMO || /\s/.test(texto)) return false
  try {
    const url = new URL(texto)
    return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

/** Lo que viaja: sin los espacios de los extremos que deja el copiar y pegar. */
export function enlaceParaEnviar(enlace: string): string {
  return enlace.trim()
}

/** Por qué "Confirmar" sigue bloqueado en la entrega, o `undefined` si el enlace sirve. */
export function razonBloqueoDelEnlace(enlace: string): string | undefined {
  const limpio = enlaceParaEnviar(enlace)
  if (limpio === '') return TEXTO_RAZON_ENLACE_VACIO
  return esEnlaceSeguro(limpio) ? undefined : TEXTO_RAZON_ENLACE_INVALIDO
}
