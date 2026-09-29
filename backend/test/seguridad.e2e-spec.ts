import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CategoriaSolicitud, RolUsuario } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { crearAppE2E, JWT_SECRET_E2E, PrismaMockE2E } from './utils/crear-app-e2e';

/**
 * Cadena de seguridad completa por HTTP real (Fase 1):
 * JwtAuthGuard (global) → RolesGuard (global) → ValidationPipe → controlador → servicio.
 */
describe('Cadena de seguridad Zero Trust (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaMockE2E;
  let firmar: (sub: string, rol: RolUsuario) => string;

  const bearer = (token: string): string => `Bearer ${token}`;

  beforeAll(async () => {
    ({ app, prisma, firmar } = await crearAppE2E());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks(); // Limpia llamadas registradas; conserva las implementaciones
  });

  describe('Autenticación (401)', () => {
    it('1. sin token → 401 (denegar por defecto)', () => {
      return request(app.getHttpServer()).get('/solicitudes/mis-solicitudes').expect(401);
    });

    it('2. token firmado con OTRO secreto → 401', () => {
      const falsificado = new JwtService({ secret: 'secreto-del-atacante' }).sign({
        sub: 'uuid-staff',
        correo: 'staff@unicesmag.edu.co',
        rol: RolUsuario.STAFF,
      });
      return request(app.getHttpServer())
        .get('/solicitudes/mis-solicitudes')
        .set('Authorization', bearer(falsificado))
        .expect(401);
    });

    it('3. token expirado → 401', () => {
      const expirado = new JwtService({ secret: JWT_SECRET_E2E }).sign({
        sub: 'uuid-staff',
        correo: 'staff@unicesmag.edu.co',
        rol: RolUsuario.STAFF,
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      return request(app.getHttpServer())
        .get('/solicitudes/mis-solicitudes')
        .set('Authorization', bearer(expirado))
        .expect(401);
    });

    it('4. token válido de un usuario BORRADO de la BD → 401 (Decisión A)', () => {
      return request(app.getHttpServer())
        .get('/solicitudes/mis-solicitudes')
        .set('Authorization', bearer(firmar('uuid-borrado', RolUsuario.STAFF)))
        .expect(401);
    });
  });

  it('5. @Public(): POST /auth/google/login sin token pasa los guards (400 por body vacío, no 401)', () => {
    return request(app.getHttpServer()).post('/auth/google/login').send({}).expect(400);
  });

  describe('Autorización (403 vs 200)', () => {
    it('6. SOLICITANTE → GET /solicitudes → 403', () => {
      return request(app.getHttpServer())
        .get('/solicitudes')
        .set('Authorization', bearer(firmar('uuid-solicitante', RolUsuario.SOLICITANTE)))
        .expect(403);
    });

    it('7. STAFF → GET /solicitudes → 200 (prueba el ORDEN de los APP_GUARD)', () => {
      // Si RolesGuard corriera antes que JwtAuthGuard, req.user no existiría y esto daría 401.
      return request(app.getHttpServer())
        .get('/solicitudes')
        .set('Authorization', bearer(firmar('uuid-staff', RolUsuario.STAFF)))
        .expect(200);
    });

    it('8. token dice STAFF pero la BD dice SOLICITANTE → 403 (degradación inmediata, Decisión A)', () => {
      return request(app.getHttpServer())
        .get('/solicitudes')
        .set('Authorization', bearer(firmar('uuid-degradado', RolUsuario.STAFF)))
        .expect(403);
    });

    it('9. SOLICITANTE → GET /usuarios → 403 (Decisión E)', () => {
      return request(app.getHttpServer())
        .get('/usuarios')
        .set('Authorization', bearer(firmar('uuid-solicitante', RolUsuario.SOLICITANTE)))
        .expect(403);
    });

    it('10. SOLICITANTE → GET /recursos = 200 (catálogo) y POST /recursos = 403 (inventario)', async () => {
      const token = bearer(firmar('uuid-solicitante', RolUsuario.SOLICITANTE));
      await request(app.getHttpServer()).get('/recursos').set('Authorization', token).expect(200);
      await request(app.getHttpServer())
        .post('/recursos')
        .set('Authorization', token)
        .send({ nombre: 'Cámara', cantidad_total: 1 })
        .expect(403);
    });
  });

  it('11. SOLICITANTE → GET /solicitudes/mis-solicitudes → 200 con SU id (prueba el ORDEN de rutas)', async () => {
    // Si ':radicado' se declarara antes, esta petición caería en findOne (solo STAFF) → 403.
    await request(app.getHttpServer())
      .get('/solicitudes/mis-solicitudes')
      .set('Authorization', bearer(firmar('uuid-solicitante', RolUsuario.SOLICITANTE)))
      .expect(200);

    expect(prisma.solicitud.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_usuario: 'uuid-solicitante' } }),
    );
  });

  it('12. POST /solicitudes con id_usuario en el body → 400 (forbidNonWhitelisted en la app real)', async () => {
    const inicio = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const respuesta = await request(app.getHttpServer())
      .post('/solicitudes')
      .set('Authorization', bearer(firmar('uuid-solicitante', RolUsuario.SOLICITANTE)))
      .send({
        categoria: CategoriaSolicitud.ESPACIOS,
        proposito: 'Intento de suplantación',
        fecha_inicio: inicio.toISOString(),
        fecha_fin: new Date(inicio.getTime() + 60 * 60 * 1000).toISOString(),
        id_usuario: 'uuid-staff',
      })
      .expect(400);

    expect(JSON.stringify(respuesta.body)).toContain('property id_usuario should not exist');
  });

  it('13. STAFF → PATCH /solicitudes/:radicado → 200 y el log registra al STAFF del token', async () => {
    await request(app.getHttpServer())
      .patch('/solicitudes/EC-2099-0001')
      .set('Authorization', bearer(firmar('uuid-staff', RolUsuario.STAFF)))
      .send({ estado: 'Validado' })
      .expect(200);

    expect(prisma.log_Auditoria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ modificado_por: 'uuid-staff', estado_nuevo: 'Validado' }),
    });
  });
});
