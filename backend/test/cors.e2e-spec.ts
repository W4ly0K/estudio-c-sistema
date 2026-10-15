import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { crearAppE2E, ORIGEN_FRONTEND_E2E } from './utils/crear-app-e2e';

/**
 * CORS por HTTP real (Fase 6.2 · DS2), con la MISMA función que usa main.ts.
 * Lo que se verifica es lo que lee el navegador: los encabezados Access-Control-*.
 */
describe('CORS con lista blanca (e2e)', () => {
  let app: INestApplication<App>;
  const AJENO = 'https://sitio-ajeno.example';

  beforeAll(async () => {
    ({ app } = await crearAppE2E());
  });

  afterAll(async () => {
    await app.close();
  });

  const preflight = (origen: string) =>
    request(app.getHttpServer())
      .options('/solicitudes/mis-solicitudes')
      .set('Origin', origen)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

  it('C-1 · preflight desde el frontend: permite el origen, el método y el encabezado Authorization', async () => {
    const respuesta = await preflight(ORIGEN_FRONTEND_E2E).expect(204);

    expect(respuesta.headers['access-control-allow-origin']).toBe(ORIGEN_FRONTEND_E2E);
    expect(respuesta.headers['access-control-allow-methods']).toBe('GET,POST,PATCH,DELETE');
    expect(respuesta.headers['access-control-allow-headers']).toBe('Authorization,Content-Type,Accept');
    expect(respuesta.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('C-2 · preflight desde un origen ajeno: sin Access-Control-Allow-Origin (el navegador bloquea)', async () => {
    const respuesta = await preflight(AJENO);

    expect(respuesta.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('C-3 · una petición desde un origen ajeno SÍ llega al servidor (401 por el JWT), pero sin permiso para leerla', async () => {
    // CORS no es una barrera del servidor: la seguridad real la siguen dando el JWT y los guards.
    const respuesta = await request(app.getHttpServer())
      .get('/solicitudes/mis-solicitudes')
      .set('Origin', AJENO)
      .expect(401);

    expect(respuesta.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('C-4 · la respuesta varía según el origen (Vary: Origin), para que ninguna caché la comparta entre sitios', async () => {
    const respuesta = await request(app.getHttpServer())
      .get('/solicitudes/mis-solicitudes')
      .set('Origin', ORIGEN_FRONTEND_E2E)
      .expect(401);

    expect(respuesta.headers['access-control-allow-origin']).toBe(ORIGEN_FRONTEND_E2E);
    expect(respuesta.headers.vary).toMatch(/Origin/);
  });
});
