import { RolUsuario } from '@prisma/client';
import { filtroDeAcceso } from './filtro-de-acceso';
import type { UsuarioAutenticado } from '../../auth/interfaces/usuario-autenticado.interface';
import { USUARIO_SOLICITANTE, USUARIO_STAFF } from '../../../test/utils/contexto-http.mock';

describe('filtroDeAcceso (política de acceso por fila)', () => {
  it('STAFF puede ver todas las solicitudes (filtro vacío)', () => {
    expect(filtroDeAcceso(USUARIO_STAFF)).toEqual({});
  });

  it('SOLICITANTE solo ve las propias: el id del token entra en el WHERE', () => {
    expect(filtroDeAcceso(USUARIO_SOLICITANTE)).toEqual({ id_usuario: USUARIO_SOLICITANTE.id });
  });

  it('un rol sin política lanza error en lugar de devolver {} (fail-closed)', () => {
    const rolDesconocido: UsuarioAutenticado = {
      id: 'uuid-x',
      correo: 'x@unicesmag.edu.co',
      rol: 'ADMIN' as unknown as RolUsuario,
    };
    expect(() => filtroDeAcceso(rolDesconocido)).toThrow('Rol sin política de acceso definida');
  });
});
