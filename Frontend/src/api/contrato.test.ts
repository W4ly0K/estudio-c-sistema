import { describe, expect, it } from 'vitest'
// Prueba de DERIVA (Decisión DC4), con el método de estados.spec.ts del backend: se
// lee el CÓDIGO FUENTE de la fuente de verdad como texto (?raw de Vite) y se compara
// con la copia del frontend. Si alguien cambia uno sin el otro, falla en el CI.
import fuenteEsquemaPrisma from '../../../backend/prisma/schema.prisma?raw'
import fuenteMaquina from '../../../backend/src/solicitudes/reglas/maquina-estados.ts?raw'
import fuenteServicio from '../../../backend/src/solicitudes/solicitudes.service.ts?raw'
import { CATEGORIAS } from './esquemas'
import { ACCIONES, ESTADOS, ROLES, TRANSICIONES } from './maquina-estados'
import fuenteHorario from '../../../backend/src/solicitudes/reglas/horario.validator.ts?raw'
import { MENSAJE_CAMBIO_CONCURRENTE, MENSAJE_FIN_NO_POSTERIOR } from './mensajes'

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

const FILA_TRANSICION =
  /\{ id: '(T\d)', accion: '([A-Z_]+)', origen: '([^']+)', destino: '([^']+)', rol: (STAFF|SOLICITANTE) \}/g

describe('Contrato con el backend: la copia del frontend no se desvía (DC4)', () => {
  it('los 7 estados, en el mismo orden', () => {
    const delBackend = listaDelBackend('ESTADOS')
    expect(delBackend).toHaveLength(7)
    expect([...ESTADOS]).toEqual(delBackend)
  })

  it('las 8 acciones, en el mismo orden', () => {
    expect([...ACCIONES]).toEqual(listaDelBackend('ACCIONES'))
  })

  it('las 9 transiciones T1 a T9, fila por fila', () => {
    const delBackend = [...lf(fuenteMaquina).matchAll(FILA_TRANSICION)].map(([, id, accion, origen, destino, rol]) => ({
      id,
      accion,
      origen,
      destino,
      rol,
    }))
    // Sin este piso, un cambio de formato dejaría la lista vacía y la prueba no compararía nada.
    expect(delBackend).toHaveLength(9)
    expect(TRANSICIONES.map((t) => ({ ...t }))).toEqual(delBackend)
  })

  it('los roles coinciden con el enum RolUsuario de Prisma', () => {
    expect([...ROLES]).toEqual(enumDePrisma('RolUsuario'))
  })

  it('las categorías coinciden con el enum CategoriaSolicitud de Prisma', () => {
    expect([...CATEGORIAS]).toEqual(enumDePrisma('CategoriaSolicitud'))
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
