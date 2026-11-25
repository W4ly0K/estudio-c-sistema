import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import type { Resultado } from './api/cliente'
import { useApi } from './api/contexto-api'
import { textoDeError } from './api/errores'
import type { SolicitudPropia, UsuarioSesion } from './api/esquemas'
import { Encabezado } from './componentes/Encabezado'
import { TarjetaSolicitud } from './componentes/TarjetaSolicitud'
import { MAXIMO_PROXIMAS_INICIO, REGLAS_ESTUDIO_C, resumenInicioSolicitante } from './presentacion/inicio'
import { RUTA_MIS_SOLICITUDES } from './rutas'

export const TEXTO_TITULO_INICIO_SOLICITANTE = 'Inicio'
export const TEXTO_CARGANDO_INICIO_SOLICITANTE = 'Cargando tus solicitudes...'
export const TEXTO_NUEVA_SOLICITUD = 'Nueva solicitud'
export const TEXTO_VER_TODAS = 'Ver todas mis solicitudes'
export const TEXTO_TITULO_PENDIENTES = 'Pendientes de tu respuesta'
export const TEXTO_AYUDA_PENDIENTES =
  'El Staff te propuso otra franja. Mientras no respondas, el Estudio C no puede confirmar tu reserva.'
export const TEXTO_TITULO_PROXIMAS = 'Tus próximas reservas'
export const TEXTO_SIN_PROXIMAS = 'No tienes reservas validadas por delante.'
export const TEXTO_TITULO_REGLAS = 'Antes de reservar'

interface InicioSolicitanteProps {
  usuario: UsuarioSesion
  onLogout: () => void
}

/**
 * Inicio del solicitante (Fase 7 · C5). Un solo GET /solicitudes/mis-solicitudes; las listas
 * las calcula `resumenInicioSolicitante` (pura) y las tarjetas son las MISMAS del panel B1.
 * Orden: lo que bloquea al Estudio (tu respuesta) arriba, luego lo que viene, luego las reglas.
 * "Nueva solicitud" lleva al panel, donde vive el formulario B2 (decisión del plan C5).
 */
export default function InicioSolicitante({ usuario, onLogout }: InicioSolicitanteProps) {
  const api = useApi()
  const id = useId()
  const ids = { pendientes: `${id}-pendientes`, proximas: `${id}-proximas`, reglas: `${id}-reglas` }
  // Mismo patrón de carga por versión que InicioStaff y TableroStaff.
  const [version, setVersion] = useState(0)
  const [respuesta, setRespuesta] = useState<{
    readonly version: number
    readonly resultado: Resultado<SolicitudPropia[]>
  } | null>(null)

  useEffect(() => {
    let vigente = true
    void api.misSolicitudes().then((resultado) => {
      if (vigente) setRespuesta({ version, resultado })
    })
    return () => {
      vigente = false
    }
  }, [api, version])

  const cargando = respuesta === null || respuesta.version !== version
  const resultado = respuesta?.resultado
  const resumen = resultado !== undefined && resultado.ok ? resumenInicioSolicitante(resultado.datos, new Date()) : null
  const error = !cargando && resultado !== undefined && !resultado.ok ? textoDeError(resultado.error) : null

  return (
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <Encabezado usuario={usuario} onLogout={onLogout} titulo={TEXTO_TITULO_INICIO_SOLICITANTE} />
      <main className="flex-1 p-8 max-w-[1000px] mx-auto w-full space-y-8">
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div>
            <h2 className="text-2xl font-black text-primary">Hola, {usuario.nombre}</h2>
            <p className="text-sm text-gray-600">Reserva los espacios del Estudio C y sigue tus solicitudes.</p>
          </div>
          <Link
            to={RUTA_MIS_SOLICITUDES}
            className="px-5 py-2.5 bg-primary text-white rounded-sm font-bold hover:opacity-90"
          >
            {TEXTO_NUEVA_SOLICITUD}
          </Link>
        </div>

        {cargando && resumen === null && <p className="text-sm text-gray-500">{TEXTO_CARGANDO_INICIO_SOLICITANTE}</p>}
        {error !== null && (
          <div>
            <p role="alert" className="p-3 bg-red-50 border border-red-200 rounded-sm text-sm font-bold text-accent">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setVersion((v) => v + 1)}
              className="mt-2 text-sm underline font-semibold text-primary"
            >
              Reintentar
            </button>
          </div>
        )}

        {resumen !== null && (
          <>
            {/* Solo si hay alguna: es un llamado a la acción, no una sección permanente. */}
            {resumen.pendientesDeTuRespuesta.length > 0 && (
              <section aria-labelledby={ids.pendientes} className="space-y-3">
                <h2 id={ids.pendientes} className="text-lg font-bold text-primary">
                  <span aria-hidden="true">⚠ </span>
                  {TEXTO_TITULO_PENDIENTES} ({resumen.pendientesDeTuRespuesta.length})
                </h2>
                <p className="text-sm text-gray-700">{TEXTO_AYUDA_PENDIENTES}</p>
                <ul className="space-y-4">
                  {resumen.pendientesDeTuRespuesta.map((solicitud) => (
                    <li key={solicitud.radicado}>
                      <TarjetaSolicitud solicitud={solicitud} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby={ids.proximas} className="space-y-3">
              <h2 id={ids.proximas} className="text-lg font-bold text-primary">
                {TEXTO_TITULO_PROXIMAS}
              </h2>
              {resumen.proximasValidadas.length === 0 ? (
                <p className="text-sm text-gray-500">{TEXTO_SIN_PROXIMAS}</p>
              ) : (
                <ul className="space-y-4">
                  {resumen.proximasValidadas.slice(0, MAXIMO_PROXIMAS_INICIO).map((solicitud) => (
                    <li key={solicitud.radicado}>
                      <TarjetaSolicitud solicitud={solicitud} />
                    </li>
                  ))}
                </ul>
              )}
              <Link to={RUTA_MIS_SOLICITUDES} className="inline-block text-sm font-medium text-primary underline">
                {TEXTO_VER_TODAS}
              </Link>
            </section>
          </>
        )}

        <section aria-labelledby={ids.reglas} className="border border-outline rounded-lg p-6 bg-surface">
          <h2 id={ids.reglas} className="font-bold text-primary mb-2">
            {TEXTO_TITULO_REGLAS}
          </h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
            {REGLAS_ESTUDIO_C.map((regla) => (
              <li key={regla}>{regla}</li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
