/**
 * Única puerta de entrada a la configuración del frontend (DT3).
 *
 * Vite incrusta las variables VITE_* en el bundle al compilar: no son secretos.
 * Si falta alguna, la aplicación se detiene al cargar con un mensaje claro
 * (fail-fast), igual que JWT_SECRET en el backend, en lugar de fallar más tarde
 * con un error difícil de rastrear.
 */
export interface Entorno {
  /** URL base de la API, sin barra final. */
  readonly apiUrl: string
  readonly googleClientId: string
}

export type VariablesDeEntorno = Readonly<
  Record<'VITE_API_URL' | 'VITE_GOOGLE_CLIENT_ID', string | undefined>
>

const AYUDA = 'Copia Frontend/.env.example como Frontend/.env.local y completa los valores.'

/** Función pura: valida y normaliza. Se exporta para probarla sin Vite. */
export function leerEntorno(variables: VariablesDeEntorno): Entorno {
  const faltantes = (Object.keys(variables) as (keyof VariablesDeEntorno)[]).filter(
    (nombre) => (variables[nombre] ?? '').trim() === '',
  )
  if (faltantes.length > 0) {
    throw new Error(`Configuración incompleta: falta ${faltantes.join(', ')}. ${AYUDA}`)
  }

  const apiUrl = (variables.VITE_API_URL ?? '').trim().replace(/\/+$/, '')
  if (!URL.canParse(apiUrl) || !/^https?:$/.test(new URL(apiUrl).protocol)) {
    throw new Error(`VITE_API_URL no es una URL http(s) válida: "${apiUrl}". ${AYUDA}`)
  }

  return {
    apiUrl,
    googleClientId: (variables.VITE_GOOGLE_CLIENT_ID ?? '').trim(),
  }
}

export const entorno: Entorno = leerEntorno({
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID,
})
