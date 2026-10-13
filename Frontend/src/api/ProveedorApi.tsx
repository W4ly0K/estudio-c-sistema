import type { ReactNode } from 'react'
import { ContextoApi } from './contexto-api'
import type { ApiSolicitudes } from './solicitudes'

/** Pone la api al alcance de `useApi()` en todo el árbol (la App la crea una sola vez). */
export function ProveedorApi({ api, children }: { api: ApiSolicitudes; children: ReactNode }) {
  return <ContextoApi value={api}>{children}</ContextoApi>
}
