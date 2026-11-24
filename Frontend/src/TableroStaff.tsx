import { useEffect, useId, useState } from 'react'
import type { Resultado } from './api/cliente'
import { useApi } from './api/contexto-api'
import { textoDeError } from './api/errores'
import type { SolicitudTablero, UsuarioSesion } from './api/esquemas'
import { CabeceraPagina } from './componentes/CabeceraPagina'
import { PantallaConSesion } from './componentes/PantallaConSesion'
import { TarjetaTablero } from './componentes/TarjetaTablero'
import { etiquetaEstado } from './presentacion/etiquetas'
import { agruparTablero, textoUrgentes, type ColumnaTablero } from './presentacion/tablero'
import type { Estado } from './api/maquina-estados'
import { CajaError } from './componentes/CajaError'

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

/**
 * Composición (ADR-010 §2.8 C-13): el estado de espera se pinta DEBAJO de las cuatro etapas
 * operativas, a ancho completo. Es solo presentación: el estado, su nombre y su pertenencia a
 * las activas no cambian (agruparTablero sigue devolviendo las 5 columnas).
 */
const ESTADO_EN_ESPERA: Estado = 'Pendiente de Reprogramación'

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
  const operativas = tablero === null ? [] : tablero.activas.filter((c) => c.estado !== ESTADO_EN_ESPERA)
  const enEspera = tablero === null ? undefined : tablero.activas.find((c) => c.estado === ESTADO_EN_ESPERA)
  const totalCerradas = tablero === null ? 0 : tablero.cerradas.reduce((total, c) => total + c.solicitudes.length, 0)

  return (
    <PantallaConSesion usuario={usuario} onLogout={onLogout} claseContenido="flex-1 p-8 max-w-[1400px] mx-auto w-full space-y-6">
        {/* Deshabilitado mientras viaja la petición: un doble clic no dispara dos GET. */}
        <CabeceraPagina
          contexto="Staff"
          titulo={TEXTO_TITULO_TABLERO}
          descripcion="Urgentes primero y luego por la franja más próxima (hora de Colombia)."
          accion={
            <button
              type="button"
              onClick={() => setVersion((v) => v + 1)}
              disabled={actualizando}
              className="px-4 py-2 border border-primary rounded-sm text-sm font-bold text-primary hover:bg-superficie-suave disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {actualizando ? 'Actualizando…' : 'Actualizar'}
            </button>
          }
        />

        {/* Solo tras pedirlo (versión > 0): la carga inicial no se anuncia. */}
        {!actualizando && version > 0 && solicitudes !== null && (
          <output className="block text-sm font-bold text-primary">
            <span aria-hidden="true">✓ </span>
            Tablero actualizado ({solicitudes.length} en total).
          </output>
        )}
        {actualizando && solicitudes === null && <p className="text-sm text-texto-secundario">{TEXTO_CARGANDO_TABLERO}</p>}
        {error !== null && (
          <CajaError className="text-sm font-bold">
            {error}
          </CajaError>
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
            {/* Orden del DOM = orden de lectura: primero las cuatro etapas, luego la espera (también en móvil). */}
            <div data-fila="operativa" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
              {operativas.map((columna) => (
                <Columna key={columna.estado} columna={columna} cerrada={false} />
              ))}
            </div>
            {enEspera !== undefined && <Columna columna={enEspera} cerrada={false} ancha />}
            {/* DE3 · DT1: las cerradas son historial; plegadas para no competir con el trabajo pendiente. */}
            <details className="border border-borde-suave rounded-lg bg-surface p-4">
              <summary className="cursor-pointer font-bold text-primary">Solicitudes cerradas ({totalCerradas})</summary>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                {tablero.cerradas.map((columna) => (
                  <Columna key={columna.estado} columna={columna} cerrada />
                ))}
              </div>
            </details>
          </>
        )}
      </PantallaConSesion>
  )
}

/**
 * Una columna: región con nombre (su estado), contador y la lista de tarjetas. «ancha» la pinta
 * como sección de ancho completo (la espera): tarjetas en rejilla y, vacía, en una sola línea compacta.
 */
function Columna({
  columna,
  cerrada,
  ancha = false,
}: {
  columna: ColumnaTablero<SolicitudTablero>
  cerrada: boolean
  ancha?: boolean
}) {
  const id = useId()
  const { estado, solicitudes } = columna
  return (
    // V1-D (ADR-010 §2.8 C-12): la cabecera de la columna va sobre blanco y separada por un borde;
    // el contador queda FUERA del h3 (el nombre de la región sigue siendo solo el estado). El vacío
    // se muestra como una caja proporcionada, no como texto suelto.
    <section
      aria-labelledby={id}
      data-columna={estado}
      data-ancha={ancha ? 'true' : undefined}
      className="rounded-lg border border-borde-suave bg-superficie-suave"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b border-borde-suave bg-surface px-3 py-2.5">
        <h3 id={id} className="font-bold text-primary">
          {etiquetaEstado(estado, 'STAFF')}
        </h3>
        <p className="shrink-0 rounded-full border border-borde-suave bg-superficie-suave px-2 py-0.5 text-xs font-bold text-texto-principal">
          {contarSolicitudes(solicitudes.length)}
        </p>
      </div>
      <div className={ancha && solicitudes.length === 0 ? 'flex flex-wrap items-center gap-x-4 gap-y-2 p-3' : 'space-y-3 p-3'}>
        {estado === ESTADO_EN_ESPERA && <p className="text-xs text-texto-secundario">{TEXTO_COLUMNA_PENDIENTE}</p>}
        {solicitudes.length === 0 ? (
          <p
            data-vacio="true"
            className={
              ancha
                ? 'rounded-md border border-borde-suave bg-surface px-3 py-1.5 text-sm text-texto-secundario'
                : 'rounded-md border border-borde-suave bg-surface px-3 py-4 text-center text-sm text-texto-secundario'
            }
          >
            {TEXTO_COLUMNA_VACIA}
          </p>
        ) : (
          <ul className={ancha ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 items-start' : 'space-y-3'}>
            {solicitudes.map((solicitud) => (
              <li key={solicitud.radicado}>
                <TarjetaTablero solicitud={solicitud} mostrarEstado={cerrada} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
