import { INestApplication } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { crearAppE2E, USUARIOS_BD } from './utils/crear-app-e2e';

/**
 * GET /auth/perfil por HTTP real (Fase 6.2 · DS1): la cadena completa de seguridad
 * (JwtAuthGuard global con la consulta a la BD) y la forma exacta de la respuesta.
 */
describe('GET /auth/perfil (e2e)', () => {
  let app: INestApplication<App>;
  let firmar: (sub: string, rol: RolUsuario) => string;

  beforeAll(async () => {
    ({ app, firmar } = await crearAppE2E());
  });

  afterAll(async () => {
    await app.close();
  });

  const perfil = (token?: string) => {
    const peticion = request(app.getHttpServer()).get('/auth/perfil');
    return token === undefined ? peticion : peticion.set('Authorization', `Bearer ${token}`);
  };

  it('PE-1 · sin token → 401 (denegar por defecto)', async () => {
    await perfil().expect(401);
  });

  it('PE-2 · SOLICITANTE → 200 con exactamente { id, nombre, rol }: sin el correo', async () => {
    const respuesta = await perfil(firmar('uuid-solicitante', RolUsuario.SOLICITANTE)).expect(200);

    expect(respuesta.body).toEqual({
      id: 'uuid-solicitante',
      nombre: USUARIOS_BD['uuid-solicitante']?.nombre,
      rol: RolUsuario.SOLICITANTE,
    });
    expect(JSON.stringify(respuesta.body)).not.toContain('@unicesmag.edu.co');
  });

  it('PE-3 · STAFF → 200 con su rol', async () => {
    const respuesta = await perfil(firmar('uuid-staff', RolUsuario.STAFF)).expect(200);

    expect(respuesta.body).toMatchObject({ id: 'uuid-staff', rol: RolUsuario.STAFF });
  });

  it('PE-4 · el rol sale de la BD, no del token: un Staff degradado se ve como SOLICITANTE', async () => {
    const respuesta = await perfil(firmar('uuid-degradado', RolUsuario.STAFF)).expect(200);

    expect(respuesta.body).toMatchObject({ id: 'uuid-degradado', rol: RolUsuario.SOLICITANTE });
  });

  it('PE-5 · token válido de un usuario que ya no existe → 401', async () => {
    await perfil(firmar('uuid-borrado', RolUsuario.SOLICITANTE)).expect(401);
  });
});
