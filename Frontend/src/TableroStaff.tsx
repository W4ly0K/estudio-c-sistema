import { useEffect, useId, useState } from 'react'
import type { Resultado } from './api/cliente'
import { useApi } from './api/contexto-api'
import { textoDeError } from './api/errores'
import type { SolicitudTablero, UsuarioSesion } from './api/esquemas'
import { Encabezado } from './componentes/Encabezado'
import { TarjetaTablero } from './componentes/TarjetaTablero'
import { etiquetaEstado } from './presentacion/etiquetas'
import { agruparTablero, textoUrgentes, type ColumnaTablero } from './presentacion/tablero'

export const TEXTO_TITULO_TABLERO = 'Tablero de solicitudes'
export const TEXTO_CARGANDO_TABLERO = 'Cargando el tablero...'
export const TEXTO_COLUMNA_VACIA = 'Sin solicitudes.'
/**
 * UI honesta: desde "Pendiente de Reprogramación" la máquina no le da ninguna transición
 * al Staff; la decisión es del solicitante (T7 o T8).
 */
export const TEXTO_COLUMNA_PENDIENTE = 'Esperan la respuesta del solicitante: el Staff no tiene acciones en este estado.'

type Respuesta =
  | { readonly tipo: 'lista'; readonly solicitudes: readonly SolicitudTablero[] }
  | { readonly tipo: 'error'; readonly texto: string }

function aRespuesta(resultado: Resultado<SolicitudTablero[]>): Respuesta {
  if (resultado.ok) return { tipo: 'lista', solicitudes: resultado.datos }
  return { tipo: 'error', texto: textoDeError(resultado.error) }
}

const contarSolicitudes = (n: number): string => (n === 1 ? '1 solicitud' : `${n} solicitudes`)

interface TableroStaffProps {
  usuario: UsuarioSesion
  onLogout: () => void
}

/**
 * Tablero del Staff (6.5.1 · DE3 y DE5). Un solo GET /solicitudes, agrupado y ordenado
 * en el cliente por agruparTablero(); la vista solo pinta. Sin consultas periódicas: se
 * recarga al volver a "/" (el componente se monta de nuevo) y con "Actualizar".
 */
export default function TableroStaff({ usuario, onLogout }: TableroStaffProps) {
  const api = useApi()
  // Mismo patrón que DetalleSolicitud: la respuesta se guarda JUNTO a la versión que la
  // pidió y "actualizando" se DERIVA (la guardada es de otra versión). El efecto solo
  // escribe estado en el callback asíncrono, y una respuesta tardía se descarta.
  const [version, setVersion] = useState(0)
  const [respuesta, setRespuesta] = useState<{ readonly version: number; readonly estado: Respuesta } | null>(null)

  useEffect(() => {
    let vigente = true
    void api.tablero().then((resultado) => {
      if (vigente) setRespuesta({ version, estado: aRespuesta(resultado) })
    })
    return () => {
      vigente = false
    }
  }, [api, version])

  const actualizando = respuesta === null || respuesta.version !== version
  const estado = respuesta?.estado
  // Mientras se actualiza se sigue mostrando el último tablero (no parpadea). Un error,
  // en cambio, solo se muestra si es la respuesta vigente.
  const solicitudes = estado !== undefined && estado.tipo === 'lista' ? estado.solicitudes : null
  const error = !actualizando && estado !== undefined && estado.tipo === 'error' ? estado.texto : null
  const tablero = solicitudes === null ? null : agruparTablero(solicitudes)
  const avisoUrgentes = tablero === null ? null : textoUrgentes(tablero.urgentesEnRecibido)
  const totalCerradas = tablero === null ? 0 : tablero.cerradas.reduce((total, c) => total + c.solicitudes.length, 0)

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <Encabezado usuario={usuario} onLogout={onLogout} titulo="Tablero del Staff" />
      <main className="flex-1 p-8 max-w-[1400px] mx-auto w-full space-y-6">
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div>
            <h2 className="text-2xl font-black text-primary">{TEXTO_TITULO_TABLERO}</h2>
            <p className="text-sm text-gray-600">Urgentes primero y luego por la franja más próxima (hora de Colombia).</p>
          </div>
          {/* Deshabilitado mientras viaja la petición: un doble clic no dispara dos GET. */}
          <button
            type="button"
            onClick={() => setVersion((v) => v + 1)}
            disabled={actualizando}
            className="px-4 py-2 border border-primary rounded-sm text-sm font-bold text-primary hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {actualizando ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        {/* Solo tras pedirlo (versión > 0): la carga inicial no se anuncia. */}
        {!actualizando && version > 0 && solicitudes !== null && (
          <output className="block text-sm font-bold text-primary">
            <span aria-hidden="true">✓ </span>
            Tablero actualizado ({solicitudes.length} en total).
          </output>
        )}
        {actualizando && solicitudes === null && <p className="text-sm text-gray-500">{TEXTO_CARGANDO_TABLERO}</p>}
        {error !== null && (
          <p role="alert" className="p-3 bg-red-50 border border-red-200 rounded-sm text-sm font-bold text-accent">
            {error}
          </p>
        )}

        {tablero !== null && (
          <>
            {/* DT2 · wireframe C2, "atención requerida": solo si hay urgentes por revisar. */}
            {avisoUrgentes !== null && (
              <p className="p-3 border-2 border-dashed border-urgencia rounded-sm bg-surface text-sm font-bold text-urgencia">
                <span aria-hidden="true">⚠ </span>
                {avisoUrgentes}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-start">
              {tablero.activas.map((columna) => (
                <Columna key={columna.estado} columna={columna} cerrada={false} />
              ))}
            </div>
            {/* DE3 · DT1: las cerradas son historial; plegadas para no competir con el trabajo pendiente. */}
            <details className="border border-outline rounded-lg bg-surface p-4">
              <summary className="cursor-pointer font-bold text-primary">Solicitudes cerradas ({totalCerradas})</summary>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                {tablero.cerradas.map((columna) => (
                  <Columna key={columna.estado} columna={columna} cerrada />
                ))}
              </div>
            </details>
          </>
        )}
      </main>
    </div>
  )
}

/** Una columna: región con nombre (su estado), contador y la lista de tarjetas. */
function Columna({ columna, cerrada }: { columna: ColumnaTablero<SolicitudTablero>; cerrada: boolean }) {
  const id = useId()
  const { estado, solicitudes } = columna
  return (
    <section aria-labelledby={id} className="rounded-lg border border-outline bg-gray-50 p-3">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 id={id} className="font-bold text-primary">
          {etiquetaEstado(estado, 'STAFF')}
        </h3>
        <p className="text-xs font-bold text-gray-600">{contarSolicitudes(solicitudes.length)}</p>
      </div>
      {estado === 'Pendiente de Reprogramación' && <p className="text-xs text-gray-600 mb-3">{TEXTO_COLUMNA_PENDIENTE}</p>}
      {solicitudes.length === 0 ? (
        <p className="text-sm text-gray-500">{TEXTO_COLUMNA_VACIA}</p>
      ) : (
        <ul className="space-y-3">
          {solicitudes.map((solicitud) => (
            <li key={solicitud.radicado}>
              <TarjetaTablero solicitud={solicitud} mostrarEstado={cerrada} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
