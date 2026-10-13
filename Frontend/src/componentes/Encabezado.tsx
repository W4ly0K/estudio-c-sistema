import type { UsuarioSesion } from '../api/esquemas'
import logoEstudioC from '../assets/Logo_Estudio_C_3-01.png'

interface EncabezadoProps {
  usuario: UsuarioSesion
  onLogout: () => void
  titulo: string
}

/** Encabezado institucional de las pantallas con sesión (panel y detalle). */
export function Encabezado({ usuario, onLogout, titulo }: EncabezadoProps) {
  return (
    <header className="w-full bg-surface border-b border-outline px-8 py-3 flex justify-between items-center sticky top-0 z-50 shadow-xs">
      <div className="flex items-center gap-4">
        <img src={logoEstudioC} alt="Logo Estudio C" className="h-8" />
        <span className="font-bold text-primary border-l border-outline pl-4 tracking-wide">{titulo}</span>
      </div>
      <div className="flex items-center gap-5">
        <div className="text-right">
          <p className="text-sm font-bold text-primary">{usuario.nombre}</p>
          <p className="text-xs text-gray-500">
            Rol: <span className="font-semibold text-accent">{usuario.rol}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="px-4 py-1.5 border border-outline rounded-sm text-sm font-medium hover:bg-gray-50 text-primary transition-colors"
        >
          Salir
        </button>
      </div>
    </header>
  )
}
