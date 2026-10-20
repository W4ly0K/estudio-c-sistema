import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import type { Rol } from '../api/maquina-estados'
import type { UsuarioSesion } from '../api/esquemas'
import { RUTA_INICIO } from '../rutas'

interface SoloRolProps {
  /** El único rol que ve esta pantalla. */
  rol: Rol
  /** La sesión vigente: el rol sale del perfil verificado (DS1), nunca de la URL. */
  usuario: UsuarioSesion
  children: ReactNode
}

/**
 * Fase 7 · C2: guarda de PRESENTACIÓN para las rutas propias de un rol ("/tablero" del Staff,
 * "/mis-solicitudes" del solicitante). No es seguridad: el backend vuelve a decidir con
 * @Roles en cada petición (ADR-001, ADR-002).
 *
 * Con otro rol redirige a "/" en silencio, con `replace` (la ruta ajena no queda en el
 * historial) y SIN montar la pantalla: no se dispara ninguna petición ajena y no hay un
 * mensaje de "no autorizado" que confirme que la página existe (mismo espíritu que el 404
 * uniforme de la Decisión H).
 */
export function SoloRol({ rol, usuario, children }: SoloRolProps): ReactNode {
  if (usuario.rol !== rol) return <Navigate to={RUTA_INICIO} replace />
  return children
}
