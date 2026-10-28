import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import type { Resultado } from './api/cliente'
import { useApi } from './api/contexto-api'
import { textoDeError } from './api/errores'
import type { DetalleSolicitante, UsuarioSesion } from './api/esquemas'
import type { Rol } from './api/maquina-estados'
import type { RespuestaComando } from './api/solicitudes'
import { AccionesSolicitud } from './componentes/AccionesSolicitud'
import { Encabezado } from './componentes/Encabezado'
import { InsigniaEstado, InsigniaUrgencia } from './componentes/Insignias'
import { LineaDeVida } from './componentes/LineaDeVida'
import { formatearFranja } from './fechas/bogota'
import { ETIQUETAS_CATEGORIA, ETIQUETAS_SUB_ESPACIO } from './presentacion/etiquetas'
import { ETIQUETAS_MOTIVO_PROPUESTA, lineaDeVida, motivoDeLaPropuesta } from './presentacion/linea-de-vida'
import { RUTA_INICIO, RUTA_MIS_SOLICITUDES } from './rutas'

/**
 * README del backend §8: ajena o inexistente responden el MISMO 404. La UI tampoco los
 * distingue: decir "no es tuya" confirmaría que el radicado existe (enumeración).
 */
export const TEXTO_NO_ENCONTRADA = 'No encontramos esa solicitud'
export const TEXTO_NO_ENCONTRADA_AYUDA =
  'Revisa el número de radicado o vuelve al panel: allí están todas las solicitudes de tu cuenta.'

type EstadoCarga =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'lista'; readonly detalle: DetalleSolicitante }
  | { readonly tipo: 'no-encontrada' }
  | { readonly tipo: 'error'; readonly texto: string }

type Respuesta = Exclude<EstadoCarga, { readonly tipo: 'cargando' }>

const CARGANDO: EstadoCarga = { tipo: 'cargando' }

/** Traduce la respuesta de la api al estado de la pantalla. */
function aRespuesta(resultado: Resultado<DetalleSolicitante>): Respuesta {
  if (resultado.ok) return { tipo: 'lista', detalle: resultado.datos }
  if (resultado.error.tipo === 'http' && resultado.error.status === 404) return { tipo: 'no-encontrada' }
  return { tipo: 'error', texto: textoDeError(resultado.error) }
}

interface DetalleSolicitudProps {
  usuario: UsuarioSesion
  onLogout: () => void
}

/** Pantalla B3: detalle, línea de vida y (si la hay) la propuesta del Staff. */
export default function DetalleSolicitud({ usuario, onLogout }: DetalleSolicitudProps) {
  const { radicado } = useParams()
  const api = useApi()
  // Cada respuesta se guarda JUNTO al radicado que la pidió. "Cargando" no se guarda: se
  // DERIVA cuando la respuesta guardada es de otro radicado (o aún no hay ninguna). Así el
  // efecto solo escribe estado en el callback asíncrono, y al pasar de un detalle a otro
  // nunca se pinta, ni por un instante, la solicitud anterior.
  // `version` sube al pedir "Recargar la solicitud" (tras un 409): la respuesta guardada
  // queda vieja por la misma regla y la pantalla vuelve a "cargando" sin escribir estado
  // dentro del efecto.
  const [version, setVersion] = useState(0)
  const [respuesta, setRespuesta] = useState<{
    readonly radicado: string
    readonly version: number
    readonly estado: Respuesta
    /** Mensaje del servidor tras una acción (cancelar, aceptar, rechazar). */
    readonly aviso: string | null
  } | null>(null)
  const vigenteAhora = respuesta !== null && respuesta.radicado === radicado && respuesta.version === version
  const carga: EstadoCarga = vigenteAhora ? respuesta.estado : CARGANDO
  const aviso = vigenteAhora ? respuesta.aviso : null
  const tituloRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (radicado === undefined) return
    let vigente = true
    void api.detalleSolicitante(radicado).then((resultado) => {
      // Una respuesta que llega tarde (ya se navegó a otro radicado) se descarta.
      if (vigente) setRespuesta({ radicado, version, estado: aRespuesta(resultado), aviso: null })
    })
    return () => {
      vigente = false
    }
  }, [api, radicado, version])

  // Tras una acción, el botón que tenía el foco puede haber desaparecido (ya no hay nada
  // que cancelar): el foco vuelve al título y el aviso se anuncia desde el <output>.
  // useLayoutEffect: el foco se aplica en el mismo commit que pinta el título, nunca un
  // fotograma después (ni el lector de pantalla ni findByRole ven el título sin foco).
  useLayoutEffect(() => {
    if (aviso !== null) tituloRef.current?.focus()
  }, [aviso])

  const alCompletar = (resultado: RespuestaComando<DetalleSolicitante>) => {
    if (radicado === undefined) return
    // La solicitud que devuelve el comando ES la verdad del servidor: se pinta sin otra petición.
    setRespuesta({ radicado, version, estado: { tipo: 'lista', detalle: resultado.solicitud }, aviso: resultado.mensaje })
  }

  // Navegar en una SPA no recarga la página: el lector de pantalla no se entera del cambio.
  // Al terminar de cargar, el foco va al título de lo que se muestra (mismo commit, ver arriba).
  useLayoutEffect(() => {
    if (carga.tipo !== 'cargando') tituloRef.current?.focus()
  }, [carga.tipo])

  if (radicado === undefined) return <Navigate to={RUTA_INICIO} replace />

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <Encabezado usuario={usuario} onLogout={onLogout} titulo="Seguimiento de solicitud" />
      <main className="flex-1 p-8 max-w-[1000px] mx-auto w-full space-y-6">
        <Link to={RUTA_MIS_SOLICITUDES} className="inline-block text-sm font-medium text-primary underline">
          <span aria-hidden="true">← </span>Volver al panel
        </Link>
        {carga.tipo === 'cargando' && <p className="text-sm text-gray-500">Cargando la solicitud...</p>}
        {carga.tipo === 'no-encontrada' && (
          <div className="border border-outline rounded-lg p-8 text-center bg-surface">
            <h2 ref={tituloRef} tabIndex={-1} className="text-xl font-bold text-primary outline-none">
              {TEXTO_NO_ENCONTRADA}
            </h2>
            <p className="text-sm text-gray-600 mt-2">{TEXTO_NO_ENCONTRADA_AYUDA}</p>
          </div>
        )}
        {carga.tipo === 'error' && (
          <div>
            <h2 ref={tituloRef} tabIndex={-1} className="sr-only">
              No se pudo cargar la solicitud
            </h2>
            <p role="alert" className="p-3 bg-red-50 border border-red-200 rounded-sm text-sm font-bold text-accent">
              {carga.texto}
            </p>
          </div>
        )}
        {aviso !== null && (
          <output className="block p-3 border-2 border-primary rounded-sm bg-surface text-sm font-bold text-primary">
            <span aria-hidden="true">✓ </span>
            {aviso}
          </output>
        )}
        {carga.tipo === 'lista' && (
          <Contenido
            detalle={carga.detalle}
            tituloRef={tituloRef}
            rol={usuario.rol}
            alCompletar={alCompletar}
            alRecargar={() => setVersion((v) => v + 1)}
          />
        )}
      </main>
    </div>
  )
}

function Contenido({
  detalle,
  tituloRef,
  rol,
  alCompletar,
  alRecargar,
}: {
  detalle: DetalleSolicitante
  tituloRef: RefObject<HTMLHeadingElement | null>
  rol: Rol
  alCompletar: (respuesta: RespuestaComando<DetalleSolicitante>) => void
  alRecargar: () => void
}) {
  const propuesta =
    detalle.estado === 'Pendiente de Reprogramación' &&
    detalle.fecha_propuesta_inicio !== null &&
    detalle.fecha_propuesta_fin !== null
      ? {
          inicio: detalle.fecha_propuesta_inicio,
          fin: detalle.fecha_propuesta_fin,
          motivo: motivoDeLaPropuesta(detalle.logs),
          // Fase 7 · SE6: una propuesta sin lugar (anterior a la Fase 7) es en el MISMO lugar,
          // la misma regla con la que el servidor la acepta (T7).
          subEspacio: detalle.sub_espacio_propuesto ?? detalle.sub_espacio,
          // Q-A6: una propuesta puede cambiar solo el lugar; entonces la franja no se tacha.
          cambiaFranja:
            Date.parse(detalle.fecha_propuesta_inicio) !== Date.parse(detalle.fecha_inicio) ||
            Date.parse(detalle.fecha_propuesta_fin) !== Date.parse(detalle.fecha_fin),
        }
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
            <InsigniaEstado estado={detalle.estado} perspectiva="SOLICITANTE" />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Categoría</dt>
            <dd className="font-medium text-primary">{ETIQUETAS_CATEGORIA[detalle.categoria]}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Fecha y horario (hora de Colombia)</dt>
            <dd className="font-medium text-primary">{formatearFranja(detalle.fecha_inicio, detalle.fecha_fin)}</dd>
          </div>
          <div>
            {/* Fase 7 · PRD v2.2 §5.1: el nombre oficial completo del lugar (Q-A1). */}
            <dt className="text-gray-500">Sub-espacio</dt>
            <dd className="font-medium text-primary">{ETIQUETAS_SUB_ESPACIO[detalle.sub_espacio]}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Propósito</dt>
            <dd className="font-medium text-primary">{detalle.proposito}</dd>
          </div>
          {detalle.recursos.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Recursos</dt>
              <dd className="font-medium text-primary">
                {detalle.recursos.map((r) => `${r.cantidad_solicitada} × ${r.recurso.nombre}`).join(' · ')}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* B4: la propuesta y su motivo; la decisión, en las acciones de abajo. */}
      {propuesta !== null && (
        <section aria-label="Propuesta de reprogramación" className="border-2 border-primary rounded-lg p-6 bg-surface text-sm">
          <h3 className="font-bold text-primary">
            <span aria-hidden="true">↻ </span>Propuesta de reprogramación del Staff Estudio C
          </h3>
          {propuesta.motivo !== null && (
            <p className="mt-2 text-gray-700">
              <span className="font-semibold">{ETIQUETAS_MOTIVO_PROPUESTA.SOLICITANTE}:</span> {propuesta.motivo}
            </p>
          )}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-outline rounded-sm p-3">
              <p className="text-xs font-bold text-gray-500 uppercase">Franja original</p>
              <p className={`text-gray-500 ${propuesta.cambiaFranja ? 'line-through' : ''}`}>
                {formatearFranja(detalle.fecha_inicio, detalle.fecha_fin)}
              </p>
              {/* Tachado solo si el lugar cambia: lo que se conserva no se presenta como descartado. */}
              <p className={`text-gray-500 ${propuesta.subEspacio !== detalle.sub_espacio ? 'line-through' : ''}`}>
                {ETIQUETAS_SUB_ESPACIO[detalle.sub_espacio]}
              </p>
            </div>
            <div className="border-2 border-primary rounded-sm p-3">
              <p className="text-xs font-bold text-primary uppercase">Nueva franja propuesta</p>
              <p className="font-semibold text-primary">{formatearFranja(propuesta.inicio, propuesta.fin)}</p>
              <p className="font-semibold text-primary">
                {ETIQUETAS_SUB_ESPACIO[propuesta.subEspacio]}
                {propuesta.subEspacio === detalle.sub_espacio && (
                  <span className="font-normal text-gray-500"> (el mismo sub-espacio)</span>
                )}
              </p>
            </div>
          </div>
        </section>
      )}

      <AccionesSolicitud detalle={detalle} rol={rol} alCompletar={alCompletar} alRecargar={alRecargar} />

      {/* Pantalla del solicitante (DE2): su perspectiva es fija, no la del rol de la sesión. */}
      <LineaDeVida linea={lineaDeVida(detalle, 'SOLICITANTE')} />
    </>
  )
}
