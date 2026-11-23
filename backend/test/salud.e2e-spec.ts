import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { crearAppE2E, PrismaMockE2E } from './utils/crear-app-e2e';

/**
 * GET /salud por HTTP real, con los APP_GUARD globales de producción
 * (JwtAuthGuard → RolesGuard). Es la ruta del health check del balanceador.
 */
describe('Sonda de salud (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaMockE2E;

  beforeAll(async () => {
    ({ app, prisma } = await crearAppE2E());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. sin token → 200 { estado: "ok" } y no se cachea', async () => {
    const respuesta = await request(app.getHttpServer()).get('/salud').expect(200);

    expect(respuesta.body).toEqual({ estado: 'ok' });
    expect(respuesta.headers['cache-control']).toBe('no-store');
  });

  it('2. con un token inválido sigue en 200: la sonda no evalúa identidad', () => {
    return request(app.getHttpServer())
      .get('/salud')
      .set('Authorization', 'Bearer token-invalido')
      .expect(200);
  });

  it('3. no consulta la base de datos', async () => {
    await request(app.getHttpServer()).get('/salud').expect(200);

    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('4. solo existe GET: POST /salud → 404', () => {
    return request(app.getHttpServer()).post('/salud').expect(404);
  });
});
