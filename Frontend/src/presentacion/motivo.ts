/**
 * Motivos escritos por el Staff: rechazo (T2) y reprogramación (T5). Paso 6.5.3 · DA3.
 *
 * El contador del cliente mide EXACTAMENTE como el backend (@TextoConLongitudReal): sobre
 * el texto recortado y en puntos de código, como char_length() de PostgreSQL. Así lo que
 * el cliente deja enviar es lo que el servidor acepta. contrato.test.ts vigila los límites
 * de los dos DTO y el algoritmo del decorador.
 */
export interface LimitesMotivo {
  readonly minimo: number
  readonly maximo: number
}

export const LIMITES_MOTIVO_RECHAZO = { minimo: 10, maximo: 500 } as const satisfies LimitesMotivo
export const LIMITES_MOTIVO_REPROGRAMACION = { minimo: 10, maximo: 500 } as const satisfies LimitesMotivo

/** Lo que viaja al servidor: el mismo valor que mide el contador. */
export function motivoParaEnviar(texto: string): string {
  return texto.trim()
}

/**
 * Longitud en caracteres REALES: '🎬'.length es 2 en JavaScript y 1 en PostgreSQL. Por la
 * misma razón el `<textarea>` NO usa el atributo maxLength, que cuenta unidades UTF-16 y
 * cortaría 500 emojis en 250.
 */
export function longitudReal(texto: string): number {
  return [...motivoParaEnviar(texto)].length
}

export type EstadoMotivo = 'vacio' | 'corto' | 'valido' | 'largo'

export interface EvaluacionMotivo {
  readonly longitud: number
  readonly estado: EstadoMotivo
  readonly valido: boolean
}

export function evaluarMotivo(texto: string, { minimo, maximo }: LimitesMotivo): EvaluacionMotivo {
  const longitud = longitudReal(texto)
  const estado: EstadoMotivo =
    longitud === 0 ? 'vacio' : longitud < minimo ? 'corto' : longitud > maximo ? 'largo' : 'valido'
  return { longitud, estado, valido: estado === 'valido' }
}

const caracteres = (n: number): string => (n === 1 ? '1 carácter' : `${n} caracteres`)

/** Texto del contador: dice qué falta o qué sobra, no solo un número. */
export function textoContador({ longitud, estado }: EvaluacionMotivo, { minimo, maximo }: LimitesMotivo): string {
  switch (estado) {
    case 'vacio':
      return `Escribe entre ${minimo} y ${maximo} caracteres.`
    case 'corto':
      return `${minimo - longitud === 1 ? 'Falta' : 'Faltan'} ${caracteres(minimo - longitud)} para el mínimo de ${minimo}.`
    case 'valido':
      return `${longitud} / ${maximo} caracteres.`
    case 'largo':
      return `${longitud - maximo === 1 ? 'Sobra' : 'Sobran'} ${caracteres(longitud - maximo)}: el máximo es ${maximo}.`
    default: {
      const imposible: never = estado
      return imposible
    }
  }
}
