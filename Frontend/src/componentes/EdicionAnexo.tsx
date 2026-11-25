import { useRef, useState } from 'react'
import type { ErrorApi } from '../api/cliente'
import { useApi } from '../api/contexto-api'
import { textoDeError } from '../api/errores'
import type { DetalleSolicitante, RespuestaEdicionAnexo } from '../api/esquemas'
import {
  TEXTO_ANEXO_ACTUAL,
  TEXTO_COMO_COMPARTIR_ANEXO,
  TEXTO_ETIQUETA_ANEXO_NUEVO,
  TEXTO_RAZON_RECARGAR_ANEXO,
  anexoParaEnviar,
  cuerpoDeEdicion,
  cuerpoDeRetiro,
  textosEdicionAnexo,
  type ModoEdicionAnexo,
} from '../presentacion/anexo'
import { CampoEnlace } from './CampoEnlace'
import { DialogoConfirmacion } from './DialogoConfirmacion'
import { EnlaceAnexo } from './EnlaceAnexo'

interface EdicionAnexoProps {
  /** El detalle vigente: de aquí sale la FOTO del anexo al abrir el diálogo. */
  detalle: DetalleSolicitante
  /** El servidor confirmó: la pantalla pinta la `solicitud` devuelta y anuncia su `mensaje`. */
  alCompletar: (respuesta: RespuestaEdicionAnexo) => void
  /** Tras un 409: lo que se ve ya no vale; volver a pedir la solicitud. */
  alRecargar: () => void
}

/**
 * Fase 9 · K3 (ADR-009 AN10 a AN14): el dueño agrega, cambia o retira su anexo mientras la
 * solicitud está en «Recibido». NO es una transición: va fuera de la máquina y de
 * AccionesSolicitud. Quien la monta decide si se ofrece (edicionDelAnexoDisponible); el
 * servidor decide si se permite. Mismo patrón que AccionesSolicitud y AccionesStaff: candado
 * síncrono contra el doble envío y diálogo nativo con razón de bloqueo.
 */
export function EdicionAnexo({ detalle, alCompletar, alRecargar }: EdicionAnexoProps) {
  const api = useApi()
  const [modo, setModo] = useState<ModoEdicionAnexo | null>(null)
  const [texto, setTexto] = useState('')
  // La FOTO del anexo al abrir: es el `enlace_anexo_anterior` que se envía, exacto (AN13).
  const [anteriorObservado, setAnteriorObservado] = useState<string | null>(detalle.enlace_anexo)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<ErrorApi | null>(null)
  const candado = useRef(false)
  // DK3-4: un 409 invalida la foto. Hasta recargar no se confirma, y cerrar recarga una sola vez.
  const conflicto = useRef(false)
  const [bloqueadoPorConflicto, setBloqueadoPorConflicto] = useState(false)

  const edicion = modo === 'AGREGAR' || modo === 'CAMBIAR' ? cuerpoDeEdicion(anteriorObservado, texto) : null
  const razonBloqueo = bloqueadoPorConflicto
    ? TEXTO_RAZON_RECARGAR_ANEXO
    : edicion !== null && !edicion.ok
      ? edicion.error
      : undefined

  const abrir = (nuevoModo: ModoEdicionAnexo) => {
    setError(null)
    setTexto('')
    setAnteriorObservado(detalle.enlace_anexo)
    conflicto.current = false
    setBloqueadoPorConflicto(false)
    setModo(nuevoModo)
  }

  const cerrar = () => {
    if (candado.current) return
    setModo(null)
    setError(null)
    if (conflicto.current) {
      conflicto.current = false
      setBloqueadoPorConflicto(false)
      alRecargar()
    }
  }

  const recargar = () => {
    // Recarga explícita: el cierre que sigue no debe recargar otra vez.
    conflicto.current = false
    setBloqueadoPorConflicto(false)
    setModo(null)
    setError(null)
    alRecargar()
  }

  const confirmar = async () => {
    if (modo === null || candado.current || razonBloqueo !== undefined) return
    // RETIRAR solo se ofrece con un anexo; la guarda también le da el tipo string a la foto.
    const cuerpo =
      modo === 'RETIRAR'
        ? anteriorObservado === null
          ? null
          : cuerpoDeRetiro(anteriorObservado)
        : edicion !== null && edicion.ok
          ? edicion.cuerpo
          : null
    if (cuerpo === null) return
    candado.current = true
    setEnCurso(true)
    setError(null)
    const resultado = await api.editarAnexo(detalle.radicado, cuerpo)
    candado.current = false
    setEnCurso(false)
    if (resultado.ok) {
      // Con o sin `sin_cambios`, la verdad es la `solicitud` del servidor; aquí no se inventa nada.
      setModo(null)
      alCompletar(resultado.datos)
    } else {
      setError(resultado.error)
      if (resultado.error.tipo === 'http' && resultado.error.status === 409) {
        conflicto.current = true
        setBloqueadoPorConflicto(true)
      }
    }
  }

  const textos = modo === null ? null : textosEdicionAnexo(modo, detalle.radicado)
  const ofrecidos: readonly ModoEdicionAnexo[] = detalle.enlace_anexo === null ? ['AGREGAR'] : ['CAMBIAR', 'RETIRAR']

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {ofrecidos.map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => abrir(opcion)}
            className="px-3 py-1 border border-primary rounded-sm text-xs font-bold text-primary bg-surface"
          >
            {textosEdicionAnexo(opcion, detalle.radicado).boton}
          </button>
        ))}
      </div>

      <DialogoConfirmacion
        abierto={textos !== null}
        titulo={textos?.titulo ?? ''}
        descripcion={textos?.descripcion ?? ''}
        textoConfirmar={textos?.confirmar ?? ''}
        irreversible={textos?.irreversible ?? false}
        enCurso={enCurso}
        puedeConfirmar={razonBloqueo === undefined}
        razonBloqueo={razonBloqueo}
        onConfirmar={() => void confirmar()}
        onCerrar={cerrar}
      >
        {anteriorObservado !== null && (
          // div y no p: EnlaceAnexo pinta un <p> cuando el enlace guardado no es seguro.
          <div className="mt-4 text-gray-700">
            {TEXTO_ANEXO_ACTUAL}: <EnlaceAnexo enlace={anteriorObservado} radicado={detalle.radicado} />
          </div>
        )}
        {(modo === 'AGREGAR' || modo === 'CAMBIAR') && (
          <CampoEnlace
            etiqueta={TEXTO_ETIQUETA_ANEXO_NUEVO}
            ayuda={TEXTO_COMO_COMPARTIR_ANEXO}
            valor={texto}
            onCambio={setTexto}
            invalido={!anexoParaEnviar(texto).ok}
            soloLectura={enCurso}
          />
        )}
        {error !== null && (
          <div role="alert" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-sm text-accent">
            <p className="font-bold">{textoDeError(error)}</p>
            {/* 409: el estado o el anexo cambiaron mientras se veían (el Staff avanzó, otra pestaña...). */}
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
