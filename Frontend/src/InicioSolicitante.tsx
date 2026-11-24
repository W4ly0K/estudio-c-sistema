import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { Resultado } from './api/cliente'
import { useApi } from './api/contexto-api'
import { textoDeError } from './api/errores'
import type { SolicitudPropia, UsuarioSesion } from './api/esquemas'
import { CabeceraPagina } from './componentes/CabeceraPagina'
import { PantallaConSesion } from './componentes/PantallaConSesion'
import { Seccion } from './componentes/Seccion'
import { TarjetaSolicitud } from './componentes/TarjetaSolicitud'
import { MAXIMO_PROXIMAS_INICIO, REGLAS_ESTUDIO_C, resumenInicioSolicitante } from './presentacion/inicio'
import { RUTA_MIS_SOLICITUDES } from './rutas'
import { CajaError } from './componentes/CajaError'

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
    <PantallaConSesion usuario={usuario} onLogout={onLogout} claseContenido="flex-1 p-8 max-w-[1000px] mx-auto w-full space-y-8">
        <CabeceraPagina
          contexto={TEXTO_TITULO_INICIO_SOLICITANTE}
          titulo={`Hola, ${usuario.nombre}`}
          descripcion="Reserva los espacios del Estudio C y sigue tus solicitudes."
          accion={
            <Link
              to={RUTA_MIS_SOLICITUDES}
              className="inline-block px-5 py-2.5 bg-primary hover:bg-primary-hover text-surface rounded-sm font-bold transition-colors"
            >
              {TEXTO_NUEVA_SOLICITUD}
            </Link>
          }
        />

        {cargando && resumen === null && <p className="text-sm text-texto-secundario">{TEXTO_CARGANDO_INICIO_SOLICITANTE}</p>}
        {error !== null && (
          <div>
            <CajaError className="text-sm font-bold">
              {error}
            </CajaError>
            <button
              type="button"
              onClick={() => setVersion((v) => v + 1)}
              className="mt-2 text-sm underline font-bold text-primary"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* V1-C (ADR-010 §2.8 C-11): dos columnas desde lg. El DOM conserva el orden de prioridad
            (pendientes → próximas → recomendaciones), que es el mismo del recorrido con Tab y el de
            la columna única en móvil. */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
          <div className="space-y-8 lg:col-span-2">
            {resumen !== null && (
              <>
                {/* Solo si hay alguna: es un llamado a la acción, no una sección permanente. */}
                {resumen.pendientesDeTuRespuesta.length > 0 && (
                  <Seccion
                    variante="atencion"
                    titulo={
                      <>
                        <span aria-hidden="true">⚠ </span>
                        {TEXTO_TITULO_PENDIENTES} ({resumen.pendientesDeTuRespuesta.length})
                      </>
                    }
                    descripcion={TEXTO_AYUDA_PENDIENTES}
                  >
                    <ul className="space-y-4">
                      {resumen.pendientesDeTuRespuesta.map((solicitud) => (
                        <li key={solicitud.radicado}>
                          <TarjetaSolicitud solicitud={solicitud} />
                        </li>
                      ))}
                    </ul>
                  </Seccion>
                )}

                <Seccion titulo={TEXTO_TITULO_PROXIMAS}>
                  {resumen.proximasValidadas.length === 0 ? (
                    <p className="text-sm text-texto-secundario">{TEXTO_SIN_PROXIMAS}</p>
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
                </Seccion>
              </>
            )}
          </div>

          <aside aria-label="Recomendaciones" className="lg:col-span-1">
            <Seccion variante="secundaria" titulo={TEXTO_TITULO_REGLAS}>
              <ul className="list-disc pl-5 space-y-1 text-sm text-texto-principal">
                {REGLAS_ESTUDIO_C.map((regla) => (
                  <li key={regla}>{regla}</li>
                ))}
              </ul>
            </Seccion>
          </aside>
        </div>
      </PantallaConSesion>
  )
}
