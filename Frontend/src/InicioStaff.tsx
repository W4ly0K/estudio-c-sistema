import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import type { Resultado } from './api/cliente'
import { useApi } from './api/contexto-api'
import { textoDeError } from './api/errores'
import type { SolicitudTablero, UsuarioSesion } from './api/esquemas'
import { CabeceraPagina } from './componentes/CabeceraPagina'
import { PantallaConSesion } from './componentes/PantallaConSesion'
import { atajosDelStaff, resumenInicioStaff, type AtajoInicio } from './presentacion/inicio'
import { RUTA_TABLERO } from './rutas'
import { CajaError } from './componentes/CajaError'

export const TEXTO_TITULO_INICIO_STAFF = 'Inicio del Staff'
export const TEXTO_CARGANDO_INICIO = 'Cargando el resumen...'
export const TEXTO_IR_AL_TABLERO = 'Ir al tablero'
/** DA4 en el inicio: los contadores usan el reloj del navegador; el servidor decide al actuar. */
export const TEXTO_NOTA_RELOJ =
  'Las vencidas se calculan con la hora de tu equipo; al validar o rechazar, decide el servidor.'

interface InicioStaffProps {
  usuario: UsuarioSesion
  onLogout: () => void
}

/**
 * Inicio del Staff (Fase 7 · C4). Un solo GET /solicitudes, el mismo del tablero; los números
 * los calculan funciones puras (`resumenInicioStaff`, `atajosDelStaff`) y la vista solo pinta.
 * Q-C2: el Staff no radica (sin "Nueva solicitud"). Q-C3: sin Agenda en la Fase 7.
 */
export default function InicioStaff({ usuario, onLogout }: InicioStaffProps) {
  const api = useApi()
  // Mismo patrón que TableroStaff: la respuesta se guarda junto a la versión que la pidió y
  // "cargando" se DERIVA. Una respuesta tardía (efecto ya limpiado) se descarta.
  const [version, setVersion] = useState(0)
  const [respuesta, setRespuesta] = useState<{
    readonly version: number
    readonly resultado: Resultado<SolicitudTablero[]>
  } | null>(null)

  useEffect(() => {
    let vigente = true
    void api.tablero().then((resultado) => {
      if (vigente) setRespuesta({ version, resultado })
    })
    return () => {
      vigente = false
    }
  }, [api, version])

  const cargando = respuesta === null || respuesta.version !== version
  const resultado = respuesta?.resultado
  // Mientras se reintenta se sigue viendo lo último que se tuvo; un error solo si es el vigente.
  const atajos =
    resultado !== undefined && resultado.ok ? atajosDelStaff(resumenInicioStaff(resultado.datos, new Date())) : null
  const error = !cargando && resultado !== undefined && !resultado.ok ? textoDeError(resultado.error) : null

  return (
    <PantallaConSesion usuario={usuario} onLogout={onLogout} claseContenido="flex-1 p-8 max-w-[1100px] mx-auto w-full space-y-6">
        <CabeceraPagina
          contexto={TEXTO_TITULO_INICIO_STAFF}
          titulo={`Hola, ${usuario.nombre}`}
          descripcion="Esto es lo que espera tu atención en el Estudio C."
          accion={
            <Link to={RUTA_TABLERO} className="inline-block px-4 py-2 bg-primary hover:bg-primary-hover text-surface rounded-sm text-sm font-bold transition-colors">
              {TEXTO_IR_AL_TABLERO}
            </Link>
          }
        />

        {cargando && atajos === null && <p className="text-sm text-texto-secundario">{TEXTO_CARGANDO_INICIO}</p>}
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

        {atajos !== null && (
          <>
            <nav aria-label="Atajos del Staff">
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {atajos.map((atajo) => (
                  <li key={atajo.clave}>
                    <TarjetaAtajo atajo={atajo} />
                  </li>
                ))}
              </ul>
            </nav>
            <p className="text-xs text-texto-secundario">{TEXTO_NOTA_RELOJ}</p>
          </>
        )}
      </PantallaConSesion>
  )
}

/**
 * Un atajo: el enlace se nombra "número + título" y la ayuda es su descripción accesible.
 * Lo que pide atención se distingue por la FORMA (borde grueso y símbolo), no solo por el color.
 */
function TarjetaAtajo({ atajo }: { atajo: AtajoInicio }) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const resaltado = atajo.requiereAtencion
  // Fase 8 · requisito 6: el aviso de urgencia va en rojo; lo demás resaltado sigue en el azul del
  // Estudio. Clases completas (no armadas con plantillas): Tailwind solo genera las que lee enteras.
  const urgente = resaltado && atajo.clave === 'urgentes'
  const borde = resaltado ? (urgente ? 'border-2 border-urgencia' : 'border-2 border-primary') : 'border border-borde-suave'
  const texto = urgente ? 'text-urgencia' : 'text-primary'
  return (
    <div data-atencion={resaltado} data-urgencia={urgente} className={`flex h-full flex-col rounded-lg bg-surface p-5 ${borde}`}>
      {/* V1-C (ADR-010 §2.8 C-11): la cifra domina; el título la nombra y la ayuda queda abajo,
          alineada entre tarjetas. El nombre accesible del enlace sigue siendo "número + título". */}
      <Link to={RUTA_TABLERO} aria-describedby={idAyuda} className={`block ${texto} hover:underline`}>
        <span className="block text-4xl font-black leading-none">
          {resaltado && <span aria-hidden="true">⚠ </span>}
          {atajo.cantidad}
        </span>{' '}
        <span className="mt-2 block font-bold">{atajo.titulo}</span>
      </Link>
      <p id={idAyuda} className="mt-auto pt-3 text-xs text-texto-secundario">
        {atajo.ayuda}
      </p>
    </div>
  )
}
