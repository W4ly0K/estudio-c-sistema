import { createContext, useContext } from 'react'
import type { ApiSolicitudes } from './solicitudes'

/**
 * La api llega a los componentes por Context (Fase 6.4 · DV1), como anticipó el ADR-006
 * §2.4: con varias vistas y niveles, pasarla por props en cada nivel ya no escala.
 * Sigue siendo inyección de dependencias: las pruebas ponen una api falsa en el proveedor.
 */
export const ContextoApi = createContext<ApiSolicitudes | null>(null)

/** La api de solicitudes. Falla de inmediato (fail-fast) si se usa fuera de <ProveedorApi>. */
export function useApi(): ApiSolicitudes {
  const api = useContext(ContextoApi)
  if (api === null) {
    throw new Error('useApi() se usó fuera de <ProveedorApi>: la api no está disponible.')
  }
  return api
}
