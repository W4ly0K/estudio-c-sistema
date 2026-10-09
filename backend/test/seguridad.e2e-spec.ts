import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CategoriaSolicitud, RolUsuario } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  crearAppE2E,
  JWT_SECRET_E2E,
  PrismaMockE2E,
  SOLICITUD_AJENA_E2E,
  SOLICITUD_E2E,
} from './utils/crear-app-e2e';
import { MENSAJE_CA06 } from '../src/solicitudes/errores/traslape-ca06';
import {
  MENSAJE_CANCELAR_EN_PRODUCCION,
  MENSAJE_REPROGRAMACION_ACEPTADA,
  MENSAJE_REPROGRAMACION_RECHAZADA,
  MENSAJE_SIN_PROPUESTA_PENDIENTE,
  MENSAJE_SOLICITUD_CANCELADA,
  MENSAJE_SOLICITUD_NO_ENCONTRADA,
} from '../src/solicitudes/solicitudes.service';
import {
  SELECT_DETALLE_SOLICITANTE,
  SELECT_DETALLE_STAFF,
} from '../src/solicitudes/proyecciones/detalle-solicitud.proyeccion';

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
    // Si ':radicado' se declarara antes, esta petición caería en findOne('mis-solicitudes'),
    // que no existe → 404 (y findMany nunca se llamaría). Esta prueba lo detectaría.
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

  describe('Propiedad del radicado — Fase 2 (ADR-002)', () => {
    interface ArgsFindFirst {
      where: unknown;
      select: unknown;
    }
    const ultimaConsulta = (): ArgsFindFirst =>
      prisma.solicitud.findFirst.mock.calls[
        prisma.solicitud.findFirst.mock.calls.length - 1
      ][0] as unknown as ArgsFindFirst;

    const tokenSolicitante = (): string =>
      bearer(firmar('uuid-solicitante', RolUsuario.SOLICITANTE));
    const tokenStaff = (): string => bearer(firmar('uuid-staff', RolUsuario.STAFF));

    it('14. dueño → GET /solicitudes/:radicado propio → 200 con la proyección mínima (B3)', async () => {
      const respuesta = await request(app.getHttpServer())
        .get('/solicitudes/EC-2099-0001')
        .set('Authorization', tokenSolicitante())
        .expect(200);

      expect(respuesta.body).toEqual(expect.objectContaining({ radicado: 'EC-2099-0001' }));
      expect(ultimaConsulta().where).toEqual({
        radicado: 'EC-2099-0001',
        id_usuario: 'uuid-solicitante',
      });
      expect(ultimaConsulta().select).toBe(SELECT_DETALLE_SOLICITANTE);
    });

    it('15. solicitante → radicado AJENO → 404 (fin del IDOR)', () => {
      return request(app.getHttpServer())
        .get('/solicitudes/EC-2099-0002')
        .set('Authorization', tokenSolicitante())
        .expect(404);
    });

    it('16. ajeno e inexistente responden 404 con cuerpo IDÉNTICO (anti-enumeración)', async () => {
      const ajeno = await request(app.getHttpServer())
        .get('/solicitudes/EC-2099-0002')
        .set('Authorization', tokenSolicitante())
        .expect(404);
      const inexistente = await request(app.getHttpServer())
        .get('/solicitudes/EC-2099-9999')
        .set('Authorization', tokenSolicitante())
        .expect(404);

      expect(inexistente.body).toEqual(ajeno.body);
    });

    it('17. STAFF → radicado de cualquier usuario → 200 con la proyección completa', async () => {
      await request(app.getHttpServer())
        .get('/solicitudes/EC-2099-0002')
        .set('Authorization', tokenStaff())
        .expect(200);

      expect(ultimaConsulta().where).toEqual({ radicado: 'EC-2099-0002' });
      expect(ultimaConsulta().select).toBe(SELECT_DETALLE_STAFF);
    });

    it('18. STAFF → radicado inexistente → 404', () => {
      return request(app.getHttpServer())
        .get('/solicitudes/EC-2099-9999')
        .set('Authorization', tokenStaff())
        .expect(404);
    });
  });

  describe('Cancelación por el solicitante — Fase 5.3 (G1–G8)', () => {
    const cancelar = (radicado: string) =>
      request(app.getHttpServer()).post(`/solicitudes/${radicado}/cancelar`);
    const tokenSolicitante = (): string => bearer(firmar('uuid-solicitante', RolUsuario.SOLICITANTE));

    it('19. sin token → 401 (denegar por defecto)', () => {
      return cancelar('EC-2099-0001').expect(401);
    });

    it('20. STAFF → 403: el Staff nunca cancela en nombre del usuario (PRD §5.5)', async () => {
      await cancelar('EC-2099-0001')
        .set('Authorization', bearer(firmar('uuid-staff', RolUsuario.STAFF)))
        .expect(403);

      expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
    });

    it('21. dueño → 200; la escritura y el log llevan la identidad del token', async () => {
      const respuesta = await cancelar('EC-2099-0001').set('Authorization', tokenSolicitante()).expect(200);

      expect(respuesta.body.mensaje).toBe(MENSAJE_SOLICITUD_CANCELADA);
      expect(prisma.solicitud.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ radicado: 'EC-2099-0001', id_usuario: 'uuid-solicitante' }),
        }),
      );
      expect(prisma.log_Auditoria.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          modificado_por: 'uuid-solicitante',
          estado_nuevo: 'Cancelado por el Usuario',
        }),
      });
    });

    it('22. ajeno e inexistente → 404 con cuerpo IDÉNTICO y sin escribir (anti-enumeración)', async () => {
      const ajeno = await cancelar('EC-2099-0002').set('Authorization', tokenSolicitante()).expect(404);
      const inexistente = await cancelar('EC-2099-9999').set('Authorization', tokenSolicitante()).expect(404);

      expect(inexistente.body).toEqual(ajeno.body);
      expect(ajeno.body.message).toBe(MENSAJE_SOLICITUD_NO_ENCONTRADA);
      expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
    });

    it('23. un id_usuario en el cuerpo no cambia la identidad (Zero Trust)', async () => {
      await cancelar('EC-2099-0001')
        .set('Authorization', tokenSolicitante())
        .send({ id_usuario: 'uuid-otro' })
        .expect(200);

      expect(prisma.solicitud.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id_usuario: 'uuid-solicitante' }) }),
      );
      expect(prisma.log_Auditoria.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ modificado_por: 'uuid-solicitante' }),
      });
    });

    it('24. la propia ya en producción → 409 con el mensaje G5 y sin escribir', async () => {
      prisma.solicitud.findFirst.mockResolvedValueOnce({ ...SOLICITUD_E2E, estado: 'En Producción' });

      const respuesta = await cancelar('EC-2099-0001').set('Authorization', tokenSolicitante()).expect(409);

      expect(respuesta.body.message).toBe(MENSAJE_CANCELAR_EN_PRODUCCION);
      expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('Respuesta a la reprogramación — Fase 5.5a (T7/T8 · L1–L9)', () => {
    const responder = (radicado: string, accion: 'aceptar' | 'rechazar') =>
      request(app.getHttpServer()).post(`/solicitudes/${radicado}/reprogramacion/${accion}`);
    const tokenSolicitante = (): string => bearer(firmar('uuid-solicitante', RolUsuario.SOLICITANTE));
    /** Propia, pendiente, con propuesta el miércoles 28 de octubre de 2026, 9:00–10:00. */
    const PENDIENTE_E2E = {
      ...SOLICITUD_E2E,
      estado: 'Pendiente de Reprogramación',
      fecha_propuesta_inicio: new Date('2026-10-28T09:00:00-05:00'),
      fecha_propuesta_fin: new Date('2026-10-28T10:00:00-05:00'),
    };

    it.each(['aceptar', 'rechazar'] as const)('25. STAFF → %s → 403 (solo el dueño responde)', async (accion) => {
      await responder('EC-2099-0001', accion)
        .set('Authorization', bearer(firmar('uuid-staff', RolUsuario.STAFF)))
        .expect(403);

      expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
    });

    it('26. dueño acepta → 200; Validado con la nueva franja, urgencia en false y log del token', async () => {
      prisma.solicitud.findFirst.mockResolvedValueOnce(PENDIENTE_E2E);

      const respuesta = await responder('EC-2099-0001', 'aceptar').set('Authorization', tokenSolicitante()).expect(200);

      expect(respuesta.body.mensaje).toBe(MENSAJE_REPROGRAMACION_ACEPTADA);
      expect(prisma.solicitud.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id_usuario: 'uuid-solicitante' }),
          data: expect.objectContaining({ estado: 'Validado', es_urgencia: false, fecha_propuesta_inicio: null }),
        }),
      );
      expect(prisma.log_Auditoria.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ modificado_por: 'uuid-solicitante', estado_nuevo: 'Validado' }),
      });
    });

    it('27. dueño rechaza → 200; la solicitud queda cancelada y sin propuesta', async () => {
      prisma.solicitud.findFirst.mockResolvedValueOnce(PENDIENTE_E2E);

      const respuesta = await responder('EC-2099-0001', 'rechazar').set('Authorization', tokenSolicitante()).expect(200);

      expect(respuesta.body.mensaje).toBe(MENSAJE_REPROGRAMACION_RECHAZADA);
      expect(prisma.solicitud.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estado: 'Cancelado por el Usuario', fecha_propuesta_inicio: null }),
        }),
      );
    });

    it('28. ajeno e inexistente → 404 con cuerpo IDÉNTICO (anti-enumeración)', async () => {
      const ajeno = await responder('EC-2099-0002', 'aceptar').set('Authorization', tokenSolicitante()).expect(404);
      const inexistente = await responder('EC-2099-9999', 'aceptar').set('Authorization', tokenSolicitante()).expect(404);

      expect(inexistente.body).toEqual(ajeno.body);
      expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
    });

    it('29. la propuesta ya fue ocupada → 409 de CA-06 sin fugas', async () => {
      prisma.solicitud.findFirst.mockResolvedValueOnce(PENDIENTE_E2E).mockResolvedValueOnce(SOLICITUD_AJENA_E2E);

      const respuesta = await responder('EC-2099-0001', 'aceptar').set('Authorization', tokenSolicitante()).expect(409);

      expect(respuesta.body.message).toBe(MENSAJE_CA06);
      expect(JSON.stringify(respuesta.body)).not.toContain(SOLICITUD_AJENA_E2E.radicado);
      expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
    });

    it('30. sin propuesta pendiente (Recibido) → 409', async () => {
      const respuesta = await responder('EC-2099-0001', 'aceptar').set('Authorization', tokenSolicitante()).expect(409);

      expect(respuesta.body.message).toBe(MENSAJE_SIN_PROPUESTA_PENDIENTE);
    });

    it('31. sin token → 401 (denegar por defecto)', () => {
      return responder('EC-2099-0001', 'rechazar').expect(401);
    });
  });
});
