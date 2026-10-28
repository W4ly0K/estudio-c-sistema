import { useId, useRef, useState } from 'react'
import type { ErrorApi, Resultado } from '../api/cliente'
import { REQUIERE_ENLACE } from '../api/categorias'
import { useApi } from '../api/contexto-api'
import { textoDeError } from '../api/errores'
import type { DetalleStaff, SubEspacio } from '../api/esquemas'
import type { CambiosTablero } from '../api/solicitudes'
import { formatearFranja } from '../fechas/bogota'
import {
  TEXTO_FRANJA_INICIADA,
  accionesVisiblesDelStaff,
  ajusteAlValidar,
  franjaYaInicio,
  opcionesDelStaff,
  porElTablero,
  razonBloqueoDelAjuste,
  razonBloqueoDelStaff,
  textosDeLaOpcion,
  type DestinoDelStaff,
  type OpcionDelStaff,
  type TransicionDelTableroStaff,
  type VigenteDelAjuste,
} from '../presentacion/acciones-staff'
import { enlaceParaEnviar, esEnlaceSeguro, razonBloqueoDelEnlace } from '../presentacion/enlace'
import { ETIQUETAS_SUB_ESPACIO } from '../presentacion/etiquetas'
import { FRANJA_VACIA, camposDeLaFranja, franjaDesdeCampos, type ValoresFranja } from '../presentacion/franja'
import {
  LIMITES_MOTIVO_RECHAZO,
  LIMITES_MOTIVO_REPROGRAMACION,
  TEXTO_AYUDA_MOTIVO_RECHAZO,
  TEXTO_AYUDA_MOTIVO_REPROGRAMACION,
  motivoParaEnviar,
} from '../presentacion/motivo'
import { CampoEnlace } from './CampoEnlace'
import { CampoMotivo } from './CampoMotivo'
import { CampoSubEspacio } from './CampoSubEspacio'
import { CamposFranja } from './CamposFranja'
import { DialogoConfirmacion } from './DialogoConfirmacion'

// Fast Refresh (react/only-export-components): este archivo exporta componentes y literales.
// Los textos que se CALCULAN (las ayudas, derivadas de los límites) viven en presentacion/motivo.
export const TEXTO_ETIQUETA_MOTIVO_RECHAZO = 'Motivo del rechazo (lo verá el solicitante)'
export const TEXTO_ETIQUETA_MOTIVO_REPROGRAMACION = 'Motivo de la reprogramación (lo verá el solicitante)'
export const TEXTO_ACTUALIZANDO = 'Actualizando la solicitud…'
/** Fase 7 · T5 (Q-A6): el lugar es parte de la propuesta, igual que la franja. */
export const TEXTO_LEYENDA_SUB_ESPACIO_PROPUESTO = 'Sub-espacio propuesto'
export const TEXTO_AYUDA_PROPUESTA_DE_LUGAR =
  'Para cambiar solo el lugar, elige la misma fecha y horas actuales y otro sub-espacio. Proponer la misma franja en el mismo sub-espacio no es una reprogramación.'
/** Fase 7 · 7B.3 (Q-A4): en el ajuste el Staff ASIGNA el lugar; no lo propone. */
export const TEXTO_LEYENDA_SUB_ESPACIO_AJUSTE = 'Sub-espacio asignado'
export const TEXTO_AYUDA_AJUSTE =
  'Los campos empiezan con lo que pidió el solicitante: cambia solo lo que haga falta. Si mueves la franja, el servidor la revisa con las mismas reglas de horario y de traslape que al radicar.'
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
 * "Rechazado" o un rechazo sin motivo (E5), y una franja o un lugar fuera de T1 (D-4): aquí
 * solo se elige la rama. T1 directo no lleva ajuste (el ajuste sale de "Validar con ajustes").
 * Fase 8 · requisito 4: `enlace` es null cuando la categoría no lo pide; así ESPACIOS y
 * ASESORIAS entregan solo con el destino, como siempre.
 */
function cambiosDe(transicion: TransicionDelTableroStaff, motivo: string, enlace: string | null): CambiosTablero {
  switch (transicion.accion) {
    case 'RECHAZAR':
      return { estado: transicion.destino, motivo_rechazo: motivoParaEnviar(motivo) }
    case 'FINALIZAR':
      return enlace === null
        ? { estado: transicion.destino }
        : { estado: transicion.destino, enlace_entrega: enlaceParaEnviar(enlace) }
    case 'APROBAR':
      return { estado: transicion.destino }
    default:
      return { estado: transicion.destino }
  }
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
 * Resolución del Staff en C3: T1 (directo o con ajustes, Fase 7 · 7B.3), T2, T4, T9 y T10 por el
 * PATCH del tablero (6.5.3) y T5 por su propia ruta, con franja y motivo (6.5.4 · DR2). Mismo patrón probado que
 * AccionesSolicitud: candado síncrono, botones deshabilitados en vuelo y el diálogo FUERA
 * de la lista de botones (nunca se desmonta abierto).
 */
export function AccionesStaff({ detalle, deshabilitadas, alCompletar, alRecargar }: AccionesStaffProps) {
  const api = useApi()
  const id = useId()
  const [seleccionada, setSeleccionada] = useState<OpcionDelStaff | null>(null)
  const [motivo, setMotivo] = useState('')
  // Fase 8 · requisito 4: el enlace del producto final, solo en la entrega que lo exige.
  const [enlace, setEnlace] = useState('')
  const [franja, setFranja] = useState<ValoresFranja>(FRANJA_VACIA)
  // Fase 7 · T5 y 7B.3: arranca en el lugar VIGENTE (lo más común es cambiar solo la fecha).
  const [subEspacio, setSubEspacio] = useState<SubEspacio>(detalle.sub_espacio)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<ErrorApi | null>(null)
  /** Error de la validación local (DH4), antes de enviar: no hubo petición. */
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const candado = useRef(false)

  // Un único "ahora" por render: la advertencia DA4 y la oferta de T10 usan el mismo instante.
  const ahora = new Date()
  const acciones = accionesVisiblesDelStaff(detalle.estado, detalle.categoria, detalle.fecha_inicio, ahora)
  const opciones = opcionesDelStaff(acciones)
  const franjaActual = formatearFranja(detalle.fecha_inicio, detalle.fecha_fin)
  // DA4: se advierte sin bloquear; el reloj del servidor es el que decide (D7).
  const advertirFranja = acciones.some((t) => t.accion === 'APROBAR') && franjaYaInicio(detalle.fecha_inicio, ahora)
  const accion = seleccionada?.transicion.accion ?? null
  const ajustando = seleccionada?.ajustar === true
  // 7B.3: lo pedido por el solicitante, en los campos y contra lo que se mide el ajuste.
  const vigente: VigenteDelAjuste = {
    franja: camposDeLaFranja(detalle.fecha_inicio, detalle.fecha_fin),
    subEspacio: detalle.sub_espacio,
  }

  const pideEnlace = accion === 'FINALIZAR' && REQUIERE_ENLACE[detalle.categoria]

  // DR5 · "Confirmar" se bloquea mientras el formulario de la acción no esté completo.
  // Fase 7 · B3: una sola fuente: se habilita exactamente cuando no hay una razón para
  // bloquearlo, y esa misma razón es la que el diálogo muestra (H-B2).
  const razonBloqueo =
    accion === null
      ? undefined
      : ajustando
        ? razonBloqueoDelAjuste(franja, subEspacio, vigente)
        : pideEnlace
          ? razonBloqueoDelEnlace(enlace)
          : razonBloqueoDelStaff(accion, motivo, franja)
  const puedeConfirmar = razonBloqueo === undefined

  const abrir = (opcion: OpcionDelStaff) => {
    setError(null)
    setErrorLocal(null)
    // Cada apertura empieza de cero: un borrador viejo no se envía por accidente. T5 abre la
    // franja vacía (DR5); el ajuste, con lo pedido, porque suele corregir una sola cosa.
    setMotivo('')
    setEnlace('')
    setFranja(opcion.ajustar ? vigente.franja : FRANJA_VACIA)
    setSubEspacio(detalle.sub_espacio)
    setSeleccionada(opcion)
  }

  const cerrar = () => {
    if (candado.current) return
    setSeleccionada(null)
    setError(null)
    setErrorLocal(null)
  }

  /** Arma la petición del canal que corresponde, o `null` si la validación local la frena. */
  const peticionDe = (opcion: OpcionDelStaff): Promise<Resultado<unknown>> | null => {
    if (opcion.ajustar) {
      // 7B.3: T1 y su ajuste en UN solo PATCH: el servidor valida y audita todo junto (U5).
      const resultado = ajusteAlValidar(franja, subEspacio, vigente)
      if (!resultado.ok) {
        setErrorLocal(resultado.error)
        return null
      }
      return api.actualizarTablero(detalle.radicado, { estado: opcion.transicion.destino, ...resultado.ajuste })
    }
    const { transicion } = opcion
    if (porElTablero(transicion)) return api.actualizarTablero(detalle.radicado, cambiosDe(transicion, motivo, pideEnlace ? enlace : null))
    // T5 (DR5): las mismas dos reglas locales de B2; el resto lo decide el servidor.
    const propuesta = franjaDesdeCampos(franja)
    if (!propuesta.ok) {
      setErrorLocal(propuesta.error)
      return null
    }
    return api.proponerReprogramacion(detalle.radicado, {
      fecha_inicio: propuesta.inicio,
      fecha_fin: propuesta.fin,
      sub_espacio: subEspacio,
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
      alCompletar(seleccionada.transicion.destino)
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

  const textos = seleccionada === null ? null : textosDeLaOpcion(seleccionada, detalle.radicado, franjaActual)

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
            {opciones.map((opcion) => {
              const { boton, irreversible } = textosDeLaOpcion(opcion, detalle.radicado, franjaActual)
              return (
                <button
                  key={opcion.ajustar ? `${opcion.transicion.id}-ajustes` : opcion.transicion.id}
                  type="button"
                  onClick={() => abrir(opcion)}
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
        razonBloqueo={razonBloqueo}
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
        {pideEnlace && (
          <CampoEnlace
            valor={enlace}
            onCambio={setEnlace}
            invalido={enlaceParaEnviar(enlace) !== '' && !esEnlaceSeguro(enlaceParaEnviar(enlace))}
            soloLectura={enCurso}
          />
        )}
        {ajustando && (
          <>
            <p className="mt-4 text-gray-700">
              Pedido por el solicitante (hora de Colombia): <strong className="text-primary">{franjaActual}</strong>, en{' '}
              <strong className="text-primary">{ETIQUETAS_SUB_ESPACIO[detalle.sub_espacio]}</strong>
            </p>
            <div className="mt-4 space-y-4">
              <CamposFranja valores={franja} onCambio={setFranja} ahora={ahora} />
              <CampoSubEspacio
                leyenda={TEXTO_LEYENDA_SUB_ESPACIO_AJUSTE}
                valor={subEspacio}
                onCambio={setSubEspacio}
                soloLectura={enCurso}
              />
              <p className="text-xs text-gray-500">{TEXTO_AYUDA_AJUSTE}</p>
            </div>
          </>
        )}
        {accion === 'PROPONER_REPROGRAMACION' && (
          <>
            <p className="mt-4 text-gray-700">
              Franja actual (hora de Colombia): <strong className="text-primary">{franjaActual}</strong>
            </p>
            <div className="mt-4 space-y-4">
              <CamposFranja valores={franja} onCambio={setFranja} ahora={new Date()} />
              <CampoSubEspacio
                leyenda={TEXTO_LEYENDA_SUB_ESPACIO_PROPUESTO}
                valor={subEspacio}
                onCambio={setSubEspacio}
                soloLectura={enCurso}
              />
              <p className="text-xs text-gray-500">{TEXTO_AYUDA_PROPUESTA_DE_LUGAR}</p>
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
