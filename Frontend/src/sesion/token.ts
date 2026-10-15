/**
 * Único lugar que conoce dónde vive el JWT (Decisión DF2: localStorage en el MVP).
 *
 * localStorage puede lanzar (modo privado, almacenamiento bloqueado o lleno): cada
 * acceso va en try/catch y, si falla, la app se comporta como "sin sesión", nunca
 * se cae. El paso 6.2 construye la sesión completa sobre este módulo.
 */
const CLAVE_TOKEN = 'estudio_c_token'

export function leerToken(): string | null {
  try {
    return localStorage.getItem(CLAVE_TOKEN)
  } catch {
    return null
  }
}

export function guardarToken(token: string): void {
  try {
    localStorage.setItem(CLAVE_TOKEN, token)
  } catch {
    // Sin almacenamiento la sesión dura lo que la pestaña: el cliente pedirá login al recargar.
  }
}

export function borrarToken(): void {
  try {
    localStorage.removeItem(CLAVE_TOKEN)
  } catch {
    // Nada que borrar si el almacenamiento no está disponible.
  }
}
