import { Prisma, RolUsuario } from '@prisma/client';
import type { UsuarioAutenticado } from '../../auth/interfaces/usuario-autenticado.interface';

/**
 * Política de acceso a nivel de fila (Decisión G · ADR-002).
 * STAFF: todas las solicitudes. SOLICITANTE: solo las propias.
 * Se aplica DENTRO del WHERE: la base de datos nunca devuelve filas ajenas.
 */
export function filtroDeAcceso(usuario: UsuarioAutenticado): Prisma.SolicitudWhereInput {
  switch (usuario.rol) {
    case RolUsuario.STAFF:
      return {};
    case RolUsuario.SOLICITANTE:
      return { id_usuario: usuario.id };
    default: {
      // Fail-closed: un rol nuevo en el enum rompe la compilación aquí (never) y,
      // si llegara uno inesperado en ejecución, se lanza un error en vez de devolver {}.
      const rolSinPolitica: never = usuario.rol;
      throw new Error(`Rol sin política de acceso definida: ${String(rolSinPolitica)}`);
    }
  }
}
