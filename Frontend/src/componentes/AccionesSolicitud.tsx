import { useRef, useState } from 'react'
import type { ErrorApi, Resultado } from '../api/cliente'
import { useApi } from '../api/contexto-api'
import { textoDeError } from '../api/errores'
import type { DetalleSolicitante } from '../api/esquemas'
import type { Rol } from '../api/maquina-estados'
import type { ApiSolicitudes, RespuestaComando } from '../api/solicitudes'
import { formatearFranja } from '../fechas/bogota'
import {
  TEXTO_AYUDA_ACEPTAR,
  TEXTO_SIN_CANCELACION,
  accionesDelSolicitante,
  textosDe,
  type AccionSolicitante,
} from '../presentacion/acciones-solicitante'
import { DialogoConfirmacion } from './DialogoConfirmacion'

type Comando = Promise<Resultado<RespuestaComando<DetalleSolicitante>>>

/** Una acción, un endpoint. El `switch` es exhaustivo: una acción nueva no compila sin su ruta. */
function ejecutar(api: ApiSolicitudes, accion: AccionSolicitante, radicado: string): Comando {
  switch (accion) {
    case 'CANCELAR':
      return api.cancelar(radicado)
    case 'ACEPTAR_REPROGRAMACION':
      return api.aceptarReprogramacion(radicado)
    case 'RECHAZAR_REPROGRAMACION':
      return api.rechazarReprogramacion(radicado)
    default: {
      const imposible: never = accion
      return imposible
    }
  }
}

interface AccionesSolicitudProps {
  detalle: DetalleSolicitante
  rol: Rol
  /** El servidor confirmó: la pantalla pinta la solicitud que devolvió y su mensaje. */
  alCompletar: (respuesta: RespuestaComando<DetalleSolicitante>) => void
  /** Un 409 dice que lo que se ve ya no es lo que hay: volver a pedir la solicitud. */
  alRecargar: () => void
}

export function AccionesSolicitud({ detalle, rol, alCompletar, alRecargar }: AccionesSolicitudProps) {
  const api = useApi()
  const [seleccionada, setSeleccionada] = useState<AccionSolicitante | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<ErrorApi | null>(null)
  // Defensa en profundidad contra el doble envío. La primera barrera es el botón
  // deshabilitado (`enCurso`), pero depende de un render; este candado es SÍNCRONO y frena
  // cualquier segunda llamada a `confirmar` que llegue antes de ese render.
  const candado = useRef(false)

  // Solo el dueño tiene acciones (T3, T6, T7, T8 son del SOLICITANTE); el servidor lo
  // vuelve a verificar con el token.
  const acciones = rol === 'SOLICITANTE' ? accionesDelSolicitante(detalle.estado) : []
  const franjaPropuesta =
    detalle.fecha_propuesta_inicio !== null && detalle.fecha_propuesta_fin !== null
      ? formatearFranja(detalle.fecha_propuesta_inicio, detalle.fecha_propuesta_fin)
      : null

  const abrir = (accion: AccionSolicitante) => {
    setError(null)
    setSeleccionada(accion)
  }

  const cerrar = () => {
    if (candado.current) return
    setSeleccionada(null)
    setError(null)
  }

  const confirmar = async () => {
    if (seleccionada === null || candado.current) return
    candado.current = true
    setEnCurso(true)
    setError(null)
    const resultado = await ejecutar(api, seleccionada, detalle.radicado)
    candado.current = false
    setEnCurso(false)
    if (resultado.ok) {
      setSeleccionada(null)
      alCompletar(resultado.datos)
    } else {
      // El diálogo sigue abierto con el mensaje del servidor tal cual (403, 404, 409...).
      setError(resultado.error)
    }
  }

  const recargar = () => {
    setSeleccionada(null)
    setError(null)
    alRecargar()
  }

  const textos = seleccionada === null ? null : textosDe(seleccionada, detalle.radicado, franjaPropuesta)

  // El diálogo vive FUERA de la lista de botones y nunca se desmonta con ella. Tras un
  // éxito, la solicitud nueva ya no tiene acciones (p. ej. quedó cancelada): si el diálogo
  // estuviera dentro, React lo arrancaría del DOM todavía abierto, sin pasar por `close()`.
  // Así, primero se CIERRA (evento `close`, fin del modo modal) y luego cambia el resto.
  return (
    <>
      {acciones.length > 0 ? (
        <section aria-label="Acciones sobre la solicitud" className="border border-outline rounded-lg p-6 bg-surface">
          <div className="flex flex-wrap justify-end gap-3">
            {acciones.map((transicion) => {
              const { boton, irreversible } = textosDe(transicion.accion, detalle.radicado, franjaPropuesta)
              return (
                <button
                  key={transicion.id}
                  type="button"
                  onClick={() => abrir(transicion.accion)}
                  className={`px-4 py-2 rounded-sm text-sm font-bold ${
                    irreversible ? 'border-2 border-primary text-primary bg-surface' : 'bg-primary text-white'
                  }`}
                >
                  {boton}
                </button>
              )
            })}
          </div>
        </section>
      ) : (
        detalle.estado === 'En Producción' &&
        rol === 'SOLICITANTE' && (
          <p className="p-3 border border-outline rounded-sm bg-gray-50 text-sm text-gray-700">{TEXTO_SIN_CANCELACION}</p>
        )
      )}

      <DialogoConfirmacion
        abierto={textos !== null}
        titulo={textos?.titulo ?? ''}
        descripcion={textos?.descripcion ?? ''}
        textoConfirmar={textos?.confirmar ?? ''}
        irreversible={textos?.irreversible ?? false}
        enCurso={enCurso}
        onConfirmar={() => void confirmar()}
        onCerrar={cerrar}
      >
        {error !== null && (
          <div role="alert" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-sm text-accent">
            <p className="font-bold">{textoDeError(error)}</p>
            {seleccionada === 'ACEPTAR_REPROGRAMACION' && <p className="mt-1">{TEXTO_AYUDA_ACEPTAR}</p>}
            {/* 409: la solicitud cambió mientras se veía (el Staff avanzó, otra pestaña...). */}
            {error.tipo === 'http' && error.status === 409 && (
              <button type="button" onClick={recargar} className="mt-2 underline font-semibold">
                Recargar la solicitud
              </button>
            )}
          </div>
        )}
      </DialogoConfirmacion>
    </>
  )
}
