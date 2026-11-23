import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import type { Resultado } from './api/cliente'
import { useApi } from './api/contexto-api'
import { textoDeError } from './api/errores'
import type { SolicitudTablero, UsuarioSesion } from './api/esquemas'
import { Encabezado } from './componentes/Encabezado'
import { atajosDelStaff, resumenInicioStaff, type AtajoInicio } from './presentacion/inicio'
import { RUTA_TABLERO } from './rutas'

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
    <div className="min-h-screen bg-background font-sans flex flex-col">
      <Encabezado usuario={usuario} onLogout={onLogout} titulo={TEXTO_TITULO_INICIO_STAFF} />
      <main className="flex-1 p-8 max-w-[1100px] mx-auto w-full space-y-6">
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div>
            <h2 className="text-2xl font-black text-primary">Hola, {usuario.nombre}</h2>
            <p className="text-sm text-gray-600">Esto es lo que espera tu atención en el Estudio C.</p>
          </div>
          <Link to={RUTA_TABLERO} className="px-4 py-2 bg-primary text-white rounded-sm text-sm font-bold hover:opacity-90">
            {TEXTO_IR_AL_TABLERO}
          </Link>
        </div>

        {cargando && atajos === null && <p className="text-sm text-gray-500">{TEXTO_CARGANDO_INICIO}</p>}
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

        {atajos !== null && (
          <>
            <nav aria-label="Atajos del Staff">
              <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {atajos.map((atajo) => (
                  <li key={atajo.clave}>
                    <TarjetaAtajo atajo={atajo} />
                  </li>
                ))}
              </ul>
            </nav>
            <p className="text-xs text-gray-500">{TEXTO_NOTA_RELOJ}</p>
          </>
        )}
      </main>
    </div>
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
  const borde = resaltado ? (urgente ? 'border-2 border-urgencia' : 'border-2 border-primary') : 'border border-outline'
  const texto = urgente ? 'text-urgencia' : 'text-primary'
  return (
    <div data-atencion={resaltado} data-urgencia={urgente} className={`h-full rounded-lg bg-surface p-4 ${borde}`}>
      <Link to={RUTA_TABLERO} aria-describedby={idAyuda} className={`block ${texto} hover:underline`}>
        <span className="block text-3xl font-black">
          {resaltado && <span aria-hidden="true">⚠ </span>}
          {atajo.cantidad}
        </span>{' '}
        <span className="block font-bold">{atajo.titulo}</span>
      </Link>
      <p id={idAyuda} className="mt-2 text-xs text-gray-600">
        {atajo.ayuda}
      </p>
    </div>
  )
}
