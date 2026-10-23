import { describe, expect, it } from 'vitest'
// Prueba de DERIVA (Decisión DC4), con el método de estados.spec.ts del backend: se
// lee el CÓDIGO FUENTE de la fuente de verdad como texto (?raw de Vite) y se compara
// con la copia del frontend. Si alguien cambia uno sin el otro, falla en el CI.
import fuenteEsquemaPrisma from '../../../backend/prisma/schema.prisma?raw'
import fuenteMaquina from '../../../backend/src/solicitudes/reglas/maquina-estados.ts?raw'
import fuenteServicio from '../../../backend/src/solicitudes/solicitudes.service.ts?raw'
import { CATEGORIAS, SUB_ESPACIOS } from './esquemas'
import { ACCIONES, ESTADOS, ROLES, TRANSICIONES } from './maquina-estados'
import fuenteHorario from '../../../backend/src/solicitudes/reglas/horario.validator.ts?raw'
import { MENSAJE_CAMBIO_CONCURRENTE, MENSAJE_FIN_NO_POSTERIOR } from './mensajes'
import fuenteDtoRechazo from '../../../backend/src/solicitudes/dto/update-solicitude.dto.ts?raw'
import fuenteDtoReprogramacion from '../../../backend/src/solicitudes/dto/proponer-reprogramacion.dto.ts?raw'
import fuenteDecorador from '../../../backend/src/common/validadores/texto-con-longitud-real.decorator.ts?raw'
import { LIMITES_MOTIVO_RECHAZO, LIMITES_MOTIVO_REPROGRAMACION } from '../presentacion/motivo'

/** En Windows, Git entrega CRLF: se normaliza antes de buscar. */
const lf = (texto: string): string => texto.replace(/\r\n/g, '\n')

function capturar(fuente: string, patron: RegExp, que: string): string {
  const grupo = patron.exec(lf(fuente))?.[1]
  if (grupo === undefined) {
    throw new Error(`No se encontró ${que} en el backend: ¿cambió su formato? Actualiza esta prueba a propósito.`)
  }
  return grupo
}

/** Los literales '…' de una lista `export const NOMBRE = Object.freeze([ … ])`. */
function listaDelBackend(nombre: string): string[] {
  const cuerpo = capturar(fuenteMaquina, new RegExp(`export const ${nombre} = Object\\.freeze\\(\\[([^\\]]*)\\]`), nombre)
  return [...cuerpo.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '')
}

/** Los valores de un `enum` de schema.prisma, en su orden. */
function enumDePrisma(nombre: string): string[] {
  const cuerpo = capturar(fuenteEsquemaPrisma, new RegExp(`enum ${nombre} \\{([^}]*)\\}`), `enum ${nombre}`)
  return cuerpo.split('\n').map((linea) => linea.trim()).filter((linea) => linea !== '')
}

// `T\d+`: desde la Fase 7 existe T10 (dos dígitos). Con `T\d` su fila no se leería y el piso
// de 10 filas fallaría sin decir por qué.
const FILA_TRANSICION =
  /\{ id: '(T\d+)', accion: '([A-Z_]+)', origen: '([^']+)', destino: '([^']+)', rol: (STAFF|SOLICITANTE) \}/g

describe('Contrato con el backend: la copia del frontend no se desvía (DC4)', () => {
  it('los 8 estados, en el mismo orden', () => {
    const delBackend = listaDelBackend('ESTADOS')
    expect(delBackend).toHaveLength(8)
    expect([...ESTADOS]).toEqual(delBackend)
  })

  it('las 9 acciones, en el mismo orden', () => {
    const delBackend = listaDelBackend('ACCIONES')
    expect(delBackend).toHaveLength(9)
    expect([...ACCIONES]).toEqual(delBackend)
  })

  it('las 10 transiciones T1 a T10, fila por fila', () => {
    const delBackend = [...lf(fuenteMaquina).matchAll(FILA_TRANSICION)].map(([, id, accion, origen, destino, rol]) => ({
      id,
      accion,
      origen,
      destino,
      rol,
    }))
    // Sin este piso, un cambio de formato dejaría la lista vacía y la prueba no compararía nada.
    expect(delBackend).toHaveLength(10)
    expect(TRANSICIONES.map((t) => ({ ...t }))).toEqual(delBackend)
  })

  it('los roles coinciden con el enum RolUsuario de Prisma', () => {
    expect([...ROLES]).toEqual(enumDePrisma('RolUsuario'))
  })

  it('las categorías coinciden con el enum CategoriaSolicitud de Prisma', () => {
    expect([...CATEGORIAS]).toEqual(enumDePrisma('CategoriaSolicitud'))
  })

  it('los sub-espacios coinciden con el enum SubEspacio de Prisma (Fase 7)', () => {
    expect([...SUB_ESPACIOS]).toEqual(enumDePrisma('SubEspacio'))
  })

  it('el aviso local de "fin no posterior" es idéntico a la primera regla de CA-04 (DH4)', () => {
    expect(MENSAJE_FIN_NO_POSTERIOR).toBe(
      capturar(fuenteHorario, /FIN_NO_POSTERIOR:\s*'([^']*)'/, 'MENSAJES_ERROR_HORARIO.FIN_NO_POSTERIOR'),
    )
  })

  it('el mensaje del 409 concurrente es idéntico al del servicio (DC5)', () => {
    expect(MENSAJE_CAMBIO_CONCURRENTE).toBe(
      capturar(fuenteServicio, /export const MENSAJE_CAMBIO_CONCURRENTE =\s*'([^']*)';/, 'MENSAJE_CAMBIO_CONCURRENTE'),
    )
  })
})

/** Una constante numérica `export const NOMBRE = 123;` de un archivo del backend. */
const numeroDelBackend = (fuente: string, nombre: string): number =>
  Number(capturar(fuente, new RegExp(`export const ${nombre} = (\\d+);`), nombre))

describe('Motivos: el contador del cliente mide como el backend (6.5.3 · DA3)', () => {
  it('los límites del motivo de rechazo son los del DTO (update-solicitude.dto.ts)', () => {
    expect(LIMITES_MOTIVO_RECHAZO).toEqual({
      minimo: numeroDelBackend(fuenteDtoRechazo, 'MOTIVO_RECHAZO_MINIMO'),
      maximo: numeroDelBackend(fuenteDtoRechazo, 'MOTIVO_RECHAZO_MAXIMO'),
    })
  })

  it('los límites del motivo de reprogramación son los del DTO (proponer-reprogramacion.dto.ts)', () => {
    expect(LIMITES_MOTIVO_REPROGRAMACION).toEqual({
      minimo: numeroDelBackend(fuenteDtoReprogramacion, 'MOTIVO_REPROGRAMACION_MINIMO'),
      maximo: numeroDelBackend(fuenteDtoReprogramacion, 'MOTIVO_REPROGRAMACION_MAXIMO'),
    })
  })

  it('el algoritmo también: el decorador recorta (.trim()) y cuenta puntos de código ([...texto].length)', () => {
    // Si el backend cambiara la forma de contar, el contador del cliente mentiría aunque los
    // límites coincidieran: esta prueba obliga a revisar longitudReal() a propósito.
    const decorador = lf(fuenteDecorador)
    expect(decorador).toContain('return [...texto].length;')
    expect(decorador).toContain("typeof crudo === 'string' ? crudo.trim() : crudo")
  })
})
