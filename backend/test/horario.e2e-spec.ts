import { INestApplication, Logger } from '@nestjs/common';
import { CategoriaSolicitud, RolUsuario } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { MENSAJES_ERROR_HORARIO } from '../src/solicitudes/reglas/horario.validator';
import { MENSAJE_CA06 } from '../src/solicitudes/errores/traslape-ca06';
import {
  MENSAJE_FECHAS_SOLO_EN_RECIBIDO,
  MENSAJE_SOLICITUD_NO_ENCONTRADA,
  MENSAJE_USAR_REPROGRAMACION,
  MENSAJES_TRANSICION_INVALIDA,
} from '../src/solicitudes/solicitudes.service';
import {
  crearAppE2E,
  PrismaMockE2E,
  SOLICITUD_AJENA_E2E,
  SOLICITUD_E2E,
} from './utils/crear-app-e2e';
import {
  errorDesconocidoDePrisma,
  MENSAJE_23514_CHECK,
  MENSAJE_23P01_CREATE,
  MENSAJE_23P01_TX_INTERACTIVA,
} from './utils/errores-postgres.fixture';

/**
 * Reglas de horario por HTTP real (Fase 3): ValidationPipe → controlador →
 * servicio → evaluarHorario, con el Reloj fijado por crearAppE2E en el lunes
 * 5 de octubre de 2026 a las 10:00 (Bogotá). Fecha mínima sin urgencia: 14.
 */
describe('Reglas de horario CA-04 y urgencia (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaMockE2E;
  let token: string;
  let tokenStaff: string;

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
    tokenStaff = firmar('uuid-staff', RolUsuario.STAFF);
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

  describe('CA-06 · anti-traslape sin condición de carrera (Fase 4)', () => {
    const franjaValida = () => cuerpo('2026-10-27T09:00:00-05:00', '2026-10-27T10:00:00-05:00');

    it('23. la consulta previa encuentra un cruce → 409 con el mensaje mínimo', async () => {
      prisma.solicitud.findFirst.mockResolvedValueOnce(SOLICITUD_AJENA_E2E);

      const respuesta = await radicar(franjaValida()).expect(409);

      expect(respuesta.body.message).toBe(MENSAJE_CA06);
      expect(JSON.stringify(respuesta.body)).not.toContain(SOLICITUD_AJENA_E2E.radicado);
      expect(prisma.solicitud.create).not.toHaveBeenCalled();
    });

    it('24. el motor rechaza con el 23P01 real (carrera) → el MISMO 409, sin datos del motor', async () => {
      const avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        prisma.solicitud.create.mockRejectedValueOnce(errorDesconocidoDePrisma(MENSAJE_23P01_CREATE));

        const respuesta = await radicar(franjaValida()).expect(409);

        expect(respuesta.body.message).toBe(MENSAJE_CA06);
        const cuerpoRespuesta = JSON.stringify(respuesta.body);
        for (const fuga of ['23P01', 'Solicitud_sin_traslape', '2026-10-14']) {
          expect(cuerpoRespuesta).not.toContain(fuga);
        }
      } finally {
        avisos.mockRestore();
      }
    });

    it('25. un 23514 no se disfraza de CA-06 → 500 genérico, sin el DETAIL', async () => {
      const errores = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      try {
        prisma.solicitud.create.mockRejectedValueOnce(errorDesconocidoDePrisma(MENSAJE_23514_CHECK));

        const respuesta = await radicar(franjaValida()).expect(500);

        expect(respuesta.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      } finally {
        errores.mockRestore();
      }
    });
  });

  describe('PATCH /solicitudes/:radicado · CA-04 y CA-06 al reprogramar (Fase 4.5)', () => {
    const editar = (body: object) =>
      request(app.getHttpServer())
        .patch(`/solicitudes/${SOLICITUD_E2E.radicado}`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send(body);

    it('26. mover la reserva a un sábado → 400 CA-04 sin consultar CA-06 ni escribir', async () => {
      const respuesta = await editar(
        cuerpo('2026-10-31T09:00:00-05:00', '2026-10-31T10:00:00-05:00'),
      ).expect(400);

      expect(respuesta.body.message).toBe(MENSAJES_ERROR_HORARIO.DIA_NO_HABIL);
      expect(prisma.solicitud.findFirst).not.toHaveBeenCalled();
      expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
    });

    it('27. la reprogramación se cruza con otra → 409 con el mensaje mínimo', async () => {
      prisma.solicitud.findFirst.mockResolvedValueOnce(SOLICITUD_AJENA_E2E);

      const respuesta = await editar(
        cuerpo('2026-10-27T09:00:00-05:00', '2026-10-27T10:00:00-05:00'),
      ).expect(409);

      expect(respuesta.body.message).toBe(MENSAJE_CA06);
      expect(JSON.stringify(respuesta.body)).not.toContain(SOLICITUD_AJENA_E2E.radicado);
      expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
    });

    it('28. rescate atómico (fechas + Validado): el motor rechaza en $transaction (23P01 real) → el MISMO 409', async () => {
      const avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        prisma.solicitud.updateMany.mockRejectedValueOnce(errorDesconocidoDePrisma(MENSAJE_23P01_TX_INTERACTIVA));

        const respuesta = await editar({
          estado: 'Validado',
          ...cuerpo('2026-10-28T09:00:00-05:00', '2026-10-28T10:00:00-05:00'),
        }).expect(409);

        expect(respuesta.body.message).toBe(MENSAJE_CA06);
        expect(JSON.stringify(respuesta.body)).not.toContain('23P01');
      } finally {
        avisos.mockRestore();
      }
    });

    it('29. marcar "Entregado" (T9) una reserva que ya ocurrió → 200 (sin reglas de horario)', async () => {
      prisma.solicitud.findUnique.mockResolvedValueOnce({
        ...SOLICITUD_E2E,
        estado: 'En Producción',
        fecha_inicio: new Date('2026-09-01T09:00:00-05:00'),
        fecha_fin: new Date('2026-09-01T10:00:00-05:00'),
      });

      await editar({ estado: 'Entregado' }).expect(200);

      expect(prisma.solicitud.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('30. PRD §5.5: el STAFF no puede cancelar en nombre del usuario → 403 sin escribir', async () => {
      const respuesta = await editar({ estado: 'Cancelado por el Usuario' }).expect(403);

      expect(respuesta.body.message).toBe(MENSAJES_TRANSICION_INVALIDA.ROL_NO_AUTORIZADO);
      expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('31. E1: proponer reprogramación desde el tablero → 409 que remite a /reprogramacion', async () => {
      prisma.solicitud.findUnique.mockResolvedValueOnce({ ...SOLICITUD_E2E, estado: 'Validado' });

      const respuesta = await editar({ estado: 'Pendiente de Reprogramación' }).expect(409);

      expect(respuesta.body.message).toBe(MENSAJE_USAR_REPROGRAMACION);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('32. D2: mover las fechas de una solicitud Validada → 409 sin consultar CA-06', async () => {
      prisma.solicitud.findUnique.mockResolvedValueOnce({ ...SOLICITUD_E2E, estado: 'Validado' });

      const respuesta = await editar(
        cuerpo('2026-10-28T09:00:00-05:00', '2026-10-28T10:00:00-05:00'),
      ).expect(409);

      expect(respuesta.body.message).toBe(MENSAJE_FECHAS_SOLO_EN_RECIBIDO);
      expect(prisma.solicitud.findFirst).not.toHaveBeenCalled();
      expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
    });

    it('33. H8: radicado inexistente → 404 uniforme', async () => {
      prisma.solicitud.findUnique.mockResolvedValueOnce(null);

      const respuesta = await editar({ estado: 'Validado' }).expect(404);

      expect(respuesta.body.message).toBe(MENSAJE_SOLICITUD_NO_ENCONTRADA);
    });
  });
});
