import { INestApplication } from '@nestjs/common';
import { CategoriaSolicitud, RolUsuario } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { MENSAJES_ERROR_HORARIO } from '../src/solicitudes/reglas/horario.validator';
import { crearAppE2E, PrismaMockE2E } from './utils/crear-app-e2e';

/**
 * Reglas de horario por HTTP real (Fase 3): ValidationPipe → controlador →
 * servicio → evaluarHorario, con el Reloj fijado por crearAppE2E en el lunes
 * 5 de octubre de 2026 a las 10:00 (Bogotá). Fecha mínima sin urgencia: 14.
 */
describe('Reglas de horario CA-04 y urgencia (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaMockE2E;
  let token: string;

  const cuerpo = (fecha_inicio: string, fecha_fin: string) => ({
    categoria: CategoriaSolicitud.ESPACIOS,
    proposito: 'Grabación de clase magistral',
    fecha_inicio,
    fecha_fin,
  });

  const radicar = (body: object) =>
    request(app.getHttpServer())
      .post('/solicitudes')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    let firmar: (sub: string, rol: RolUsuario) => string;
    ({ app, prisma, firmar } = await crearAppE2E());
    token = firmar('uuid-solicitante', RolUsuario.SOLICITANTE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('19. franja válida y con poca anticipación → 201 con es_urgencia = true', async () => {
    const respuesta = await radicar(
      cuerpo('2026-10-13T14:00:00-05:00', '2026-10-13T15:00:00-05:00'),
    ).expect(201);

    expect(respuesta.body).toMatchObject({ es_urgencia: true });
    expect(prisma.solicitud.create).toHaveBeenCalledTimes(1);
  });

  it('20. "08:00Z" son las 03:00 en Bogotá → 400 CA-04 sin consultar la BD', async () => {
    const respuesta = await radicar(
      cuerpo('2026-10-27T08:00:00Z', '2026-10-27T10:00:00Z'),
    ).expect(400);

    expect(respuesta.body.message).toBe(MENSAJES_ERROR_HORARIO.FUERA_DE_BLOQUE);
    expect(prisma.solicitud.findFirst).not.toHaveBeenCalled(); // CA-06 no se ejecuta
    expect(prisma.solicitud.create).not.toHaveBeenCalled();
  });

  it('21. fecha sin zona horaria → 400 en el pipe (D-W)', async () => {
    const respuesta = await radicar(
      cuerpo('2026-10-27T08:00:00', '2026-10-27T10:00:00'),
    ).expect(400);

    expect(JSON.stringify(respuesta.body)).toContain(
      'fecha_inicio debe ser una fecha ISO 8601 real con zona horaria explícita',
    );
    expect(prisma.solicitud.create).not.toHaveBeenCalled();
  });

  it('22. fecha pasada bien formada → 400 EN_EL_PASADO (la puerta del @MinDate sigue cerrada)', async () => {
    const respuesta = await radicar(
      cuerpo('2026-10-01T09:00:00-05:00', '2026-10-01T10:00:00-05:00'),
    ).expect(400);

    expect(respuesta.body.message).toBe(MENSAJES_ERROR_HORARIO.EN_EL_PASADO);
    expect(prisma.solicitud.create).not.toHaveBeenCalled();
  });
});
