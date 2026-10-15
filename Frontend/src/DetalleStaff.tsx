import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { TEXTO_NO_ENCONTRADA } from './DetalleSolicitud'
import type { Resultado } from './api/cliente'
import { useApi } from './api/contexto-api'
import { textoDeError } from './api/errores'
import type { DetalleStaff as DatosDetalleStaff, UsuarioSesion } from './api/esquemas'
import { AccionesStaff } from './componentes/AccionesStaff'
import { Encabezado } from './componentes/Encabezado'
import { InsigniaEstado, InsigniaUrgencia } from './componentes/Insignias'
import { LineaDeVida } from './componentes/LineaDeVida'
import { formatearFranja } from './fechas/bogota'
import { textoExito, type DestinoDelStaff } from './presentacion/acciones-staff'
import { filasDeRecursos } from './presentacion/detalle-staff'
import { ETIQUETAS_CATEGORIA } from './presentacion/etiquetas'
import { ETIQUETAS_MOTIVO_PROPUESTA, lineaDeVida, motivoDeLaPropuesta } from './presentacion/linea-de-vida'
import { RUTA_PANEL } from './rutas'

export const TEXTO_NO_ENCONTRADA_AYUDA_STAFF = 'Revisa el número de radicado o vuelve al tablero.'
/** UI honesta: tras T5 la decisión es del solicitante (T7 o T8); el Staff no puede retirar la propuesta. */
export const TEXTO_PROPUESTA_EN_ESPERA_STAFF =
  'Propuesta enviada al solicitante: la solicitud espera su respuesta (aceptar o rechazar).'
/** DA2: el PATCH se aplicó y lo que falló es la recarga; decirlo evita que se repita la acción. */
export const TEXTO_RECARGA_FALLIDA = 'La acción quedó registrada, pero no pudimos recargar la solicitud:'
export const TEXTO_SIN_RECURSOS = 'La solicitud no incluye recursos.'
export const TEXTO_SUPERA_INVENTARIO = 'Supera el inventario total'
/** DD3: el total no descuenta otras reservas; decirlo evita que se lea como "disponible". */
export const TEXTO_NOTA_INVENTARIO = 'Inventario total del Estudio C: no descuenta otras reservas en la misma franja.'

type EstadoCarga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly detalle: DatosDetalleStaff }
  | { readonly tipo: 'no-encontrada' }
  | { readonly tipo: 'error'; readonly texto: string }

type Respuesta = Exclude<EstadoCarga, { readonly tipo: 'cargando' }>

const CARGANDO: EstadoCarga = { tipo: 'cargando' }

function aRespuesta(resultado: Resultado<DatosDetalleStaff>): Respuesta {
  if (resultado.ok) return { tipo: 'lista', detalle: resultado.datos }
  if (resultado.error.tipo === 'http' && resultado.error.status === 404) return { tipo: 'no-encontrada' }
  return { tipo: 'error', texto: textoDeError(resultado.error) }
}

interface DetalleStaffProps {
  usuario: UsuarioSesion
  onLogout: () => void
}

/**
 * Pantalla C3 del Staff (6.5.2 · DD1): proyección completa, recursos frente al inventario y
 * línea de vida desde la perspectiva del Staff, y la resolución (T1, T2, T4 y T9 · 6.5.3).
 * La carga repite a propósito el patrón de DetalleSolicitud (DD4): con dos usos aún no se
 * ve la abstracción correcta.
 */
export default function DetalleStaff({ usuario, onLogout }: DetalleStaffProps) {
  const { radicado } = useParams()
  const api = useApi()
  // La respuesta se guarda JUNTO a la clave que la pidió (radicado y versión). "Cargando" se
  // DERIVA: el efecto solo escribe estado en el callback asíncrono. `version` sube tras una
  // acción (DA2: el PATCH no trae los logs) o tras un 409.
  const [version, setVersion] = useState(0)
  const [respuesta, setRespuesta] = useState<{
    readonly radicado: string
    readonly version: number
    readonly estado: Respuesta
  } | null>(null)
  /** Aviso de la última acción, atado a su radicado: al navegar a otro no se arrastra. */
  const [aviso, setAviso] = useState<{ readonly radicado: string; readonly texto: string } | null>(null)

  const delRadicado = respuesta !== null && respuesta.radicado === radicado ? respuesta : null
  const vigente = delRadicado !== null && delRadicado.version === version
  // DA2 · sin parpadeo: mientras se recarga se sigue viendo el detalle anterior, con las
  // acciones bloqueadas. Un error o un 404 de otra versión no se muestran.
  const recargando = delRadicado !== null && !vigente && delRadicado.estado.tipo === 'lista'
  const carga: EstadoCarga = delRadicado !== null && (vigente || recargando) ? delRadicado.estado : CARGANDO
  const avisoVisible = aviso !== null && aviso.radicado === radicado ? aviso.texto : null
  const tituloRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (radicado === undefined) return
    let actual = true
    void api.detalleStaff(radicado).then((resultado) => {
      // Una respuesta que llega tarde (otro radicado u otra versión) se descarta.
      if (actual) setRespuesta({ radicado, version, estado: aRespuesta(resultado) })
    })
    return () => {
      actual = false
    }
  }, [api, radicado, version])

  // Navegar en una SPA no recarga la página: al terminar de cargar, el foco va al título,
  // en el mismo commit que lo pinta (useLayoutEffect, ver 6.4.5).
  useLayoutEffect(() => {
    if (carga.tipo !== 'cargando') tituloRef.current?.focus()
  }, [carga.tipo])

  // Tras una acción, el botón que tenía el foco queda bloqueado o desaparece: el foco vuelve
  // al título y el aviso se anuncia desde el <output>.
  useLayoutEffect(() => {
    if (avisoVisible !== null) tituloRef.current?.focus()
  }, [avisoVisible])

  const alCompletar = (destino: DestinoDelStaff) => {
    if (radicado === undefined) return
    setAviso({ radicado, texto: textoExito(destino) })
    setVersion((v) => v + 1)
  }

  /** Tras un 409: lo que se veía ya no vale, y tampoco el aviso de una acción anterior. */
  const recargarTrasConflicto = () => {
    setAviso(null)
    setVersion((v) => v + 1)
  }

  /** Reintento tras un error de carga: conserva el aviso (la acción sí quedó registrada). */
  const reintentar = () => setVersion((v) => v + 1)

  if (radicado === undefined) return <Navigate to={RUTA_PANEL} replace />

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <Encabezado usuario={usuario} onLogout={onLogout} titulo="Revisión de solicitud" />
      <main className="flex-1 p-8 max-w-[1000px] mx-auto w-full space-y-6">
        <Link to={RUTA_PANEL} className="inline-block text-sm font-medium text-primary underline">
          <span aria-hidden="true">← </span>Volver al tablero
        </Link>
        {avisoVisible !== null && (
          <output className="block p-3 border-2 border-primary rounded-sm bg-surface text-sm font-bold text-primary">
            <span aria-hidden="true">✓ </span>
            {avisoVisible}
          </output>
        )}
        {carga.tipo === 'cargando' && <p className="text-sm text-gray-500">Cargando la solicitud...</p>}
        {carga.tipo === 'no-encontrada' && (
          <div className="border border-outline rounded-lg p-8 text-center bg-surface">
            <h2 ref={tituloRef} tabIndex={-1} className="text-xl font-bold text-primary outline-none">
              {TEXTO_NO_ENCONTRADA}
            </h2>
            <p className="text-sm text-gray-600 mt-2">{TEXTO_NO_ENCONTRADA_AYUDA_STAFF}</p>
          </div>
        )}
        {carga.tipo === 'error' && (
          <div>
            <h2 ref={tituloRef} tabIndex={-1} className="sr-only">
              No se pudo cargar la solicitud
            </h2>
            {/* DA2 · honestidad: si el PATCH ya se aplicó, lo que falló es solo la recarga. */}
            <p role="alert" className="p-3 bg-red-50 border border-red-200 rounded-sm text-sm font-bold text-accent">
              {avisoVisible !== null ? `${TEXTO_RECARGA_FALLIDA} ${carga.texto}` : carga.texto}
            </p>
            <button type="button" onClick={reintentar} className="mt-2 text-sm underline font-semibold text-primary">
              Recargar la solicitud
            </button>
          </div>
        )}
        {carga.tipo === 'lista' && (
          <Contenido
            detalle={carga.detalle}
            tituloRef={tituloRef}
            recargando={recargando}
            alCompletar={alCompletar}
            alRecargar={recargarTrasConflicto}
          />
        )}
      </main>
    </div>
  )
}

function Contenido({
  detalle,
  tituloRef,
  recargando,
  alCompletar,
  alRecargar,
}: {
  detalle: DatosDetalleStaff
  tituloRef: RefObject<HTMLHeadingElement | null>
  recargando: boolean
  alCompletar: (destino: DestinoDelStaff) => void
  alRecargar: () => void
}) {
  const id = useId()
  const idRecursos = `${id}-recursos`
  const filas = filasDeRecursos(detalle.recursos)
  const propuesta =
    detalle.estado === 'Pendiente de Reprogramación' &&
    detalle.fecha_propuesta_inicio !== null &&
    detalle.fecha_propuesta_fin !== null
      ? { inicio: detalle.fecha_propuesta_inicio, fin: detalle.fecha_propuesta_fin, motivo: motivoDeLaPropuesta(detalle.logs) }
      : null

  return (
    <>
      <section className="border border-outline rounded-lg p-6 bg-surface">
        <p className="text-xs text-gray-500 font-bold tracking-wider">RADICADO</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 ref={tituloRef} tabIndex={-1} className="text-2xl font-black text-primary outline-none">
            {detalle.radicado}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {detalle.es_urgencia && <InsigniaUrgencia />}
            <InsigniaEstado estado={detalle.estado} />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Solicitante</dt>
            <dd className="font-medium text-primary">
              {detalle.usuario.nombre}
              {/* DD5: contactar es la acción más frecuente ante una duda; no autoriza nada. */}
              <a href={`mailto:${detalle.usuario.correo}`} className="block text-xs font-normal underline break-all">
                {detalle.usuario.correo}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Categoría</dt>
            <dd className="font-medium text-primary">{ETIQUETAS_CATEGORIA[detalle.categoria]}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Fecha y horario (hora de Colombia)</dt>
            <dd className="font-medium text-primary">{formatearFranja(detalle.fecha_inicio, detalle.fecha_fin)}</dd>
          </div>
          {detalle.num_participantes !== null && (
            <div>
              <dt className="text-gray-500">Participantes</dt>
              <dd className="font-medium text-primary">{detalle.num_participantes}</dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Propósito</dt>
            <dd className="font-medium text-primary whitespace-pre-line">{detalle.proposito}</dd>
          </div>
        </dl>
      </section>

      {propuesta !== null && (
        <section aria-label="Propuesta de reprogramación" className="border-2 border-primary rounded-lg p-6 bg-surface text-sm">
          <h3 className="font-bold text-primary">
            <span aria-hidden="true">↻ </span>Propuesta de reprogramación
          </h3>
          <p className="mt-1 text-gray-700">{TEXTO_PROPUESTA_EN_ESPERA_STAFF}</p>
          {propuesta.motivo !== null && (
            <p className="mt-2 text-gray-700">
              <span className="font-semibold">{ETIQUETAS_MOTIVO_PROPUESTA.STAFF}:</span> {propuesta.motivo}
            </p>
          )}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-outline rounded-sm p-3">
              <p className="text-xs font-bold text-gray-500 uppercase">Franja original</p>
              <p className="text-gray-500 line-through">{formatearFranja(detalle.fecha_inicio, detalle.fecha_fin)}</p>
            </div>
            <div className="border-2 border-primary rounded-sm p-3">
              <p className="text-xs font-bold text-primary uppercase">Franja propuesta</p>
              <p className="font-semibold text-primary">{formatearFranja(propuesta.inicio, propuesta.fin)}</p>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby={idRecursos} className="border border-outline rounded-lg p-6 bg-surface">
        <h3 id={idRecursos} className="text-sm font-bold text-primary mb-3">
          Recursos solicitados
        </h3>
        {filas.length === 0 ? (
          <p className="text-sm text-gray-500">{TEXTO_SIN_RECURSOS}</p>
        ) : (
          <>
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 border-b border-outline">
                <tr>
                  <th scope="col" className="py-2">Recurso</th>
                  <th scope="col" className="py-2">Solicitada</th>
                  <th scope="col" className="py-2">Inventario total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.id} className={`border-b border-outline ${fila.superaInventario ? 'bg-gray-50' : ''}`}>
                    <th scope="row" className="py-2 font-medium text-primary">{fila.nombre}</th>
                    <td className="py-2">{fila.solicitada}</td>
                    <td className="py-2">
                      {fila.inventarioTotal}
                      {/* Forma, símbolo y texto: el color nunca es la única señal (DV6). */}
                      {fila.superaInventario && (
                        <span className="ml-2 inline-block px-2 py-0.5 border-2 border-dashed border-primary rounded-sm text-xs font-bold text-primary">
                          <span aria-hidden="true">⚠ </span>
                          {TEXTO_SUPERA_INVENTARIO}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-gray-500">{TEXTO_NOTA_INVENTARIO}</p>
          </>
        )}
      </section>

      <AccionesStaff detalle={detalle} deshabilitadas={recargando} alCompletar={alCompletar} alRecargar={alRecargar} />

      <LineaDeVida linea={lineaDeVida(detalle, 'STAFF')} />
    </>
  )
}
