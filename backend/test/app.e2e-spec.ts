import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { crearAppE2E } from './utils/crear-app-e2e';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await crearAppE2E());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / sin token responde 401: denegar por defecto aplica incluso a rutas no tocadas', () => {
    return request(app.getHttpServer()).get('/').expect(401);
  });
});
