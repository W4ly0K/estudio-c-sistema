import { render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProveedorApi } from './ProveedorApi'
import { useApi } from './contexto-api'
import { apiFalsa } from '../test/fixtures-api'

describe('useApi y ProveedorApi (DV1)', () => {
  it('fuera del proveedor falla de inmediato, con un mensaje que dice qué falta', () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined) // React registra el error
    expect(() => renderHook(() => useApi())).toThrow(/fuera de <ProveedorApi>/)
    consola.mockRestore()
  })

  it('dentro del proveedor entrega exactamente la api inyectada', () => {
    const api = apiFalsa()
    function Sonda() {
      return <p>{useApi() === api ? 'la misma api' : 'otra api'}</p>
    }

    render(
      <ProveedorApi api={api}>
        <Sonda />
      </ProveedorApi>,
    )

    expect(screen.getByText('la misma api')).toBeInTheDocument()
  })
})
