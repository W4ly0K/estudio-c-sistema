import { useRef, useState } from 'react'
import type { ErrorApi } from '../api/cliente'
import { useApi } from '../api/contexto-api'
import { textoDeError } from '../api/errores'
import type { DetalleStaff, RespuestaCorreccionEntrega } from '../api/esquemas'
import { esEnlaceSeguro, enlaceParaEnviar } from '../presentacion/enlace'
import {
  TEXTO_AYUDA_ENLACE_CORREGIDO,
  TEXTO_AYUDA_MOTIVO_CORRECCION,
  TEXTO_ENLACE_ACTUAL,
  TEXTO_ETIQUETA_ENLACE_CORREGIDO,
  TEXTO_ETIQUETA_MOTIVO_CORRECCION,
  TEXTO_RAZON_RECARGAR_CORRECCION,
  cuerpoDeCorreccion,
  textosCorreccion,
} from '../presentacion/enlaces-staff'
import { LIMITES_MOTIVO_CORRECCION } from '../presentacion/motivo'
import { CampoEnlace } from './CampoEnlace'
import { CampoMotivo } from './CampoMotivo'
import { DialogoConfirmacion } from './DialogoConfirmacion'
import { EnlaceProductoFinal } from './EnlaceProductoFinal'

interface CorreccionEnlaceEntregaProps {
  /** El detalle vigente: el enlace que muestra es la FOTO que viaja como anterior. */
  detalle: DetalleStaff
  /** Mientras se recarga el detalle: lo que se ve ya no es lo vigente. */
  deshabilitada: boolean
  /** El servidor confirmó (con o sin cambios): la pantalla anuncia y recarga detalle e historial. */
  alCorregir: (respuesta: RespuestaCorreccionEntrega) => void
  /** Tras un 409: volver a pedir la solicitud. */
  alRecargar: () => void
}

/**
 * Fase 9 · K4 (ADR-008 EN6 a EN12): el Staff corrige el enlace del producto final de una entrega.
 * NO es una transición (no hay T9 ni T12 otra vez): va fuera de AccionesStaff y de la máquina.
 * Quien la monta decide si se ofrece (correccionDisponible); el servidor decide si se permite.
 */
export function CorreccionEnlaceEntrega({ detalle, deshabilitada, alCorregir, alRecargar }: CorreccionEnlaceEntregaProps) {
  const api = useApi()
  const [abierta, setAbierta] = useState(false)
  const [enlace, setEnlace] = useState('')
  const [motivo, setMotivo] = useState('')
  // EN9: la FOTO del enlace vigente al abrir; viaja exacta como enlace_entrega_anterior.
  const [anteriorObservado, setAnteriorObservado] = useState(detalle.enlace_entrega ?? '')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<ErrorApi | null>(null)
  const candado = useRef(false)
  // Un 409 invalida la foto: no se confirma de nuevo y cerrar recarga una sola vez.
  const conflicto = useRef(false)
  const [bloqueadoPorConflicto, setBloqueadoPorConflicto] = useState(false)

  const correccion = cuerpoDeCorreccion(anteriorObservado, enlace, motivo)
  const razonBloqueo = bloqueadoPorConflicto ? TEXTO_RAZON_RECARGAR_CORRECCION : correccion.ok ? undefined : correccion.error
  const textos = textosCorreccion(detalle.radicado)

  const abrir = () => {
    // Solo se ofrece con un enlace registrado (EN8); la guarda es defensa en profundidad.
    if (detalle.enlace_entrega === null) return
    setAnteriorObservado(detalle.enlace_entrega)
    setEnlace('')
    setMotivo('')
    setError(null)
    conflicto.current = false
    setBloqueadoPorConflicto(false)
    setAbierta(true)
  }

  const cerrar = () => {
    if (candado.current) return
    setAbierta(false)
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
    setAbierta(false)
    setError(null)
    alRecargar()
  }

  const confirmar = async () => {
    if (!abierta || candado.current || razonBloqueo !== undefined || !correccion.ok) return
    candado.current = true
    setEnCurso(true)
    setError(null)
    const resultado = await api.corregirEnlaceEntrega(detalle.radicado, correccion.cuerpo)
    candado.current = false
    setEnCurso(false)
    if (resultado.ok) {
      // Con o sin `sin_cambios`: es la respuesta del servidor; aquí no se inventa ningún evento.
      setAbierta(false)
      alCorregir(resultado.datos)
    } else {
      setError(resultado.error)
      if (resultado.error.tipo === 'http' && resultado.error.status === 409) {
        conflicto.current = true
        setBloqueadoPorConflicto(true)
      }
    }
  }

  const textoLimpio = enlaceParaEnviar(enlace)

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        disabled={deshabilitada}
        className="mt-2 block px-3 py-1 border border-primary rounded-sm text-xs font-bold text-primary bg-surface disabled:opacity-50"
      >
        {textos.boton}
      </button>

      <DialogoConfirmacion
        abierto={abierta}
        titulo={textos.titulo}
        descripcion={textos.descripcion}
        textoConfirmar={textos.confirmar}
        irreversible={textos.irreversible}
        enCurso={enCurso}
        puedeConfirmar={razonBloqueo === undefined}
        razonBloqueo={razonBloqueo}
        onConfirmar={() => void confirmar()}
        onCerrar={cerrar}
      >
        {/* div y no p: EnlaceProductoFinal pinta un <p> cuando el enlace guardado no es seguro. */}
        <div className="mt-4 text-gray-700">
          {TEXTO_ENLACE_ACTUAL}: <EnlaceProductoFinal enlace={anteriorObservado} radicado={detalle.radicado} />
        </div>
        <CampoEnlace
          etiqueta={TEXTO_ETIQUETA_ENLACE_CORREGIDO}
          ayuda={TEXTO_AYUDA_ENLACE_CORREGIDO}
          valor={enlace}
          onCambio={setEnlace}
          invalido={textoLimpio !== '' && !esEnlaceSeguro(textoLimpio)}
          soloLectura={enCurso}
        />
        <CampoMotivo
          etiqueta={TEXTO_ETIQUETA_MOTIVO_CORRECCION}
          ayuda={TEXTO_AYUDA_MOTIVO_CORRECCION}
          valor={motivo}
          onCambio={setMotivo}
          limites={LIMITES_MOTIVO_CORRECCION}
          soloLectura={enCurso}
        />
        {error !== null && (
          <div role="alert" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-sm text-accent">
            <p className="font-bold">{textoDeError(error)}</p>
            {error.tipo === 'http' && error.status === 409 && (
              <button type="button" onClick={recargar} className="mt-2 underline font-bold">
                Recargar la solicitud
              </button>
            )}
          </div>
        )}
      </DialogoConfirmacion>
    </>
  )
}
