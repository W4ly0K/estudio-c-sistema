import { useId, useRef, useState } from 'react'
import type { ErrorApi, Resultado } from '../api/cliente'
import { useApi } from '../api/contexto-api'
import { textoDeError } from '../api/errores'
import type { DetalleStaff } from '../api/esquemas'
import type { CambiosTablero } from '../api/solicitudes'
import { formatearFranja } from '../fechas/bogota'
import {
  TEXTO_FRANJA_INICIADA,
  accionesDelStaff,
  franjaYaInicio,
  porElTablero,
  textosDelStaff,
  type DestinoDelStaff,
  type TransicionDelTableroStaff,
  type TransicionStaff,
} from '../presentacion/acciones-staff'
import { FRANJA_VACIA, franjaCompleta, franjaDesdeCampos, type ValoresFranja } from '../presentacion/franja'
import {
  LIMITES_MOTIVO_RECHAZO,
  LIMITES_MOTIVO_REPROGRAMACION,
  TEXTO_AYUDA_MOTIVO_RECHAZO,
  TEXTO_AYUDA_MOTIVO_REPROGRAMACION,
  evaluarMotivo,
  motivoParaEnviar,
} from '../presentacion/motivo'
import { CampoMotivo } from './CampoMotivo'
import { CamposFranja } from './CamposFranja'
import { DialogoConfirmacion } from './DialogoConfirmacion'

// Fast Refresh (react/only-export-components): este archivo exporta componentes y literales.
// Los textos que se CALCULAN (las ayudas, derivadas de los límites) viven en presentacion/motivo.
export const TEXTO_ETIQUETA_MOTIVO_RECHAZO = 'Motivo del rechazo (lo verá el solicitante)'
export const TEXTO_ETIQUETA_MOTIVO_REPROGRAMACION = 'Motivo de la reprogramación (lo verá el solicitante)'
export const TEXTO_ACTUALIZANDO = 'Actualizando la solicitud…'
/**
 * Ayuda ante CUALQUIER 409, sin comparar el texto del servidor (DC5). La máquina, sobre una
 * lectura fresca, frena un cambio que llega tarde (TRANSICION_NO_DEFINIDA, estado final...) y
 * el compare-and-set, uno simultáneo: en ambos casos el Staff veía una versión vieja. Va en
 * condicional porque también es honesta ante el 409 de la franja ya iniciada (D7) o de una
 * propuesta que choca con otra reserva (CA-06).
 */
export const TEXTO_AYUDA_CONFLICTO =
  'Si la solicitud cambió mientras la tenías abierta (otra persona del Staff o el solicitante), recárgala para ver su estado actual.'

/**
 * El cuerpo del PATCH. CambiosTablero hace imposible en compilación un motivo sin
 * "Rechazado" o un rechazo sin motivo (E5): aquí solo se elige la rama.
 */
function cambiosDe(transicion: TransicionDelTableroStaff, motivo: string): CambiosTablero {
  if (transicion.accion === 'RECHAZAR') return { estado: transicion.destino, motivo_rechazo: motivoParaEnviar(motivo) }
  return { estado: transicion.destino }
}

interface AccionesStaffProps {
  detalle: DetalleStaff
  /** Mientras se recarga el detalle tras una acción: lo que se ve ya no es lo vigente. */
  deshabilitadas: boolean
  /** El servidor aceptó el cambio: la pantalla anuncia el destino y vuelve a pedir el detalle (DA2 · DR3). */
  alCompletar: (destino: DestinoDelStaff) => void
  /** Un 409 dice que lo que se ve ya no es lo que hay: volver a pedir la solicitud. */
  alRecargar: () => void
}

/**
 * Resolución del Staff en C3: T1, T2, T4 y T9 por el PATCH del tablero (6.5.3) y T5 por su
 * propia ruta, con franja y motivo (6.5.4 · DR2). Mismo patrón probado que
 * AccionesSolicitud: candado síncrono, botones deshabilitados en vuelo y el diálogo FUERA
 * de la lista de botones (nunca se desmonta abierto).
 */
export function AccionesStaff({ detalle, deshabilitadas, alCompletar, alRecargar }: AccionesStaffProps) {
  const api = useApi()
  const id = useId()
  const [seleccionada, setSeleccionada] = useState<TransicionStaff | null>(null)
  const [motivo, setMotivo] = useState('')
  const [franja, setFranja] = useState<ValoresFranja>(FRANJA_VACIA)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<ErrorApi | null>(null)
  /** Error de la validación local (DH4), antes de enviar: no hubo petición. */
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const candado = useRef(false)

  const acciones = accionesDelStaff(detalle.estado)
  const franjaActual = formatearFranja(detalle.fecha_inicio, detalle.fecha_fin)
  // DA4: se advierte sin bloquear; el reloj del servidor es el que decide (D7).
  const advertirFranja = acciones.some((t) => t.accion === 'APROBAR') && franjaYaInicio(detalle.fecha_inicio, new Date())
  const accion = seleccionada?.accion ?? null

  // DR5 · "Confirmar" se bloquea mientras el formulario de la acción no esté completo.
  const puedeConfirmar =
    accion === 'RECHAZAR'
      ? evaluarMotivo(motivo, LIMITES_MOTIVO_RECHAZO).valido
      : accion === 'PROPONER_REPROGRAMACION'
        ? franjaCompleta(franja) && evaluarMotivo(motivo, LIMITES_MOTIVO_REPROGRAMACION).valido
        : true

  const abrir = (transicion: TransicionStaff) => {
    setError(null)
    setErrorLocal(null)
    // Cada apertura empieza en blanco: un borrador viejo no se envía por accidente.
    setMotivo('')
    setFranja(FRANJA_VACIA)
    setSeleccionada(transicion)
  }

  const cerrar = () => {
    if (candado.current) return
    setSeleccionada(null)
    setError(null)
    setErrorLocal(null)
  }

  /** Arma la petición del canal que corresponde, o `null` si la validación local la frena. */
  const peticionDe = (transicion: TransicionStaff): Promise<Resultado<unknown>> | null => {
    if (porElTablero(transicion)) return api.actualizarTablero(detalle.radicado, cambiosDe(transicion, motivo))
    // T5 (DR5): las mismas dos reglas locales de B2; el resto lo decide el servidor.
    const propuesta = franjaDesdeCampos(franja)
    if (!propuesta.ok) {
      setErrorLocal(propuesta.error)
      return null
    }
    return api.proponerReprogramacion(detalle.radicado, {
      fecha_inicio: propuesta.inicio,
      fecha_fin: propuesta.fin,
      motivo: motivoParaEnviar(motivo),
    })
  }

  const confirmar = async () => {
    if (seleccionada === null || candado.current) return
    // Defensa en profundidad: el botón ya está bloqueado, pero la regla no depende de él.
    if (!puedeConfirmar) return
    setErrorLocal(null)
    setError(null)
    const peticion = peticionDe(seleccionada)
    if (peticion === null) return
    candado.current = true
    setEnCurso(true)
    const resultado = await peticion
    candado.current = false
    setEnCurso(false)
    if (resultado.ok) {
      // Primero se cierra (evento close) y luego la pantalla anuncia y recarga.
      setSeleccionada(null)
      alCompletar(seleccionada.destino)
    } else {
      setError(resultado.error)
    }
  }

  const recargar = () => {
    setSeleccionada(null)
    setError(null)
    setErrorLocal(null)
    alRecargar()
  }

  const textos = seleccionada === null ? null : textosDelStaff(seleccionada.accion, detalle.radicado, franjaActual)

  return (
    <>
      {acciones.length > 0 && (
        <section aria-labelledby={`${id}-titulo`} className="border border-outline rounded-lg p-6 bg-surface">
          <h3 id={`${id}-titulo`} className="text-sm font-bold text-primary mb-3">
            Resolución
          </h3>
          {advertirFranja && (
            <p className="mb-3 p-3 border-2 border-dashed border-primary rounded-sm text-sm text-primary">
              <span aria-hidden="true">⚠ </span>
              {TEXTO_FRANJA_INICIADA}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            {acciones.map((transicion) => {
              const { boton, irreversible } = textosDelStaff(transicion.accion, detalle.radicado, franjaActual)
              return (
                <button
                  key={transicion.id}
                  type="button"
                  onClick={() => abrir(transicion)}
                  disabled={deshabilitadas}
                  className={`px-4 py-2 rounded-sm text-sm font-bold disabled:opacity-50 ${
                    irreversible ? 'border-2 border-primary text-primary bg-surface' : 'bg-primary text-white'
                  }`}
                >
                  {boton}
                </button>
              )
            })}
          </div>
          {deshabilitadas && <p className="mt-2 text-xs text-gray-500 text-right">{TEXTO_ACTUALIZANDO}</p>}
        </section>
      )}

      <DialogoConfirmacion
        abierto={textos !== null}
        titulo={textos?.titulo ?? ''}
        descripcion={textos?.descripcion ?? ''}
        textoConfirmar={textos?.confirmar ?? ''}
        irreversible={textos?.irreversible ?? false}
        enCurso={enCurso}
        puedeConfirmar={puedeConfirmar}
        onConfirmar={() => void confirmar()}
        onCerrar={cerrar}
      >
        {/* Los campos van antes que los botones: al abrir, el foco cae en el primero. */}
        {accion === 'RECHAZAR' && (
          <CampoMotivo
            etiqueta={TEXTO_ETIQUETA_MOTIVO_RECHAZO}
            ayuda={TEXTO_AYUDA_MOTIVO_RECHAZO}
            valor={motivo}
            onCambio={setMotivo}
            limites={LIMITES_MOTIVO_RECHAZO}
            soloLectura={enCurso}
          />
        )}
        {accion === 'PROPONER_REPROGRAMACION' && (
          <>
            <p className="mt-4 text-gray-700">
              Franja actual (hora de Colombia): <strong className="text-primary">{franjaActual}</strong>
            </p>
            <div className="mt-4 space-y-4">
              <CamposFranja valores={franja} onCambio={setFranja} ahora={new Date()} />
            </div>
            <CampoMotivo
              etiqueta={TEXTO_ETIQUETA_MOTIVO_REPROGRAMACION}
              ayuda={TEXTO_AYUDA_MOTIVO_REPROGRAMACION}
              valor={motivo}
              onCambio={setMotivo}
              limites={LIMITES_MOTIVO_REPROGRAMACION}
              soloLectura={enCurso}
            />
          </>
        )}
        {errorLocal !== null && (
          <p role="alert" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-sm font-bold text-accent">
            {errorLocal}
          </p>
        )}
        {error !== null && (
          <div role="alert" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-sm text-accent">
            <p className="font-bold">{textoDeError(error)}</p>
            {/* 409: la solicitud cambió (otro miembro del Staff, el solicitante, la franja inició...). */}
            {error.tipo === 'http' && error.status === 409 && (
              <>
                <p className="mt-1">{TEXTO_AYUDA_CONFLICTO}</p>
                <button type="button" onClick={recargar} className="mt-2 underline font-semibold">
                  Recargar la solicitud
                </button>
              </>
            )}
          </div>
        )}
      </DialogoConfirmacion>
    </>
  )
}
