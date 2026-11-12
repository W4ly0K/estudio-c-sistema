import { INestApplication } from '@nestjs/common';
import { RolUsuario, Solicitud } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { MENSAJE_SOLICITUD_NO_ENCONTRADA } from '../src/solicitudes/solicitudes.service';
import { crearAppE2E, PrismaMockE2E, SOLICITUD_E2E } from './utils/crear-app-e2e';

/**
 * Fase 9 · ADR-012 EV7 y D7 (lote J2b) · GET /solicitudes/:radicado/historial-enlaces por HTTP real
 * (JWT, guards, controlador y servicio de producción), con Prisma simulado.
 */
describe('Historial de enlaces del Staff (e2e · Fase 9 · J2b)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaMockE2E;
  let firmar: (sub: string, rol: RolUsuario) => string;

  const RUTA = `/solicitudes/${SOLICITUD_E2E.radicado}/historial-enlaces`;
  const pedir = (token?: string, ruta = RUTA) => {
    const peticion = request(app.getHttpServer()).get(ruta);
    return token === undefined ? peticion : peticion.set('Authorization', `Bearer ${token}`);
  };
  /** Lo que devolvería la base, con campos de más que nunca deben llegar a la respuesta. */
  const filaConLogs = (logs: readonly object[]) => ({ radicado: SOLICITUD_E2E.radicado, logs }) as unknown as Solicitud;

  beforeAll(async () => {
    ({ app, prisma, firmar } = await crearAppE2E());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sin token → 401, sin consultar', async () => {
    await pedir().expect(401);

    expect(prisma.solicitud.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['el solicitante dueño', 'uuid-solicitante', RolUsuario.SOLICITANTE],
    ['un usuario degradado cuyo token todavía dice STAFF (el rol sale de la base)', 'uuid-degradado', RolUsuario.STAFF],
  ])('%s → 403, sin consultar (el historial es solo del Staff)', async (_caso, sub, rolDelToken) => {
    await pedir(firmar(sub, rolDelToken)).expect(403);

    expect(prisma.solicitud.findUnique).not.toHaveBeenCalled();
  });

  it('Staff y radicado inexistente → 404 uniforme', async () => {
    prisma.solicitud.findUnique.mockResolvedValueOnce(null);

    const respuesta = await pedir(firmar('uuid-staff', RolUsuario.STAFF), '/solicitudes/EC-2099-9999/historial-enlaces').expect(404);

    expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_SOLICITUD_NO_ENCONTRADA);
  });

  it('Staff y solicitud sin eventos → 200 con la lista vacía', async () => {
    prisma.solicitud.findUnique.mockResolvedValueOnce(filaConLogs([]));

    const respuesta = await pedir(firmar('uuid-staff', RolUsuario.STAFF)).expect(200);

    expect(respuesta.body).toEqual({ radicado: SOLICITUD_E2E.radicado, eventos: [] });
  });

  it('Staff → 200 con ANEXO y ENTREGA y EXACTAMENTE los campos permitidos', async () => {
    prisma.solicitud.findUnique.mockResolvedValueOnce(
      filaConLogs([
        {
          id_log: 'uuid-log-1',
          enlace_campo: 'ANEXO',
          enlace_anterior: null,
          enlace_nuevo: 'https://drive.google.com/file/d/a/view',
          motivo_correccion: null,
          modificado_por: 'uuid-solicitante',
          fecha_modificacion: new Date('2026-10-06T14:00:00.000Z'),
          estado_anterior: 'Recibido',
          radicado_solicitud: SOLICITUD_E2E.radicado,
        },
        {
          id_log: 'uuid-log-2',
          enlace_campo: 'ENTREGA',
          enlace_anterior: 'https://youtu.be/a',
          enlace_nuevo: 'https://youtu.be/b',
          motivo_correccion: 'El enlace apuntaba a un borrador.',
          modificado_por: 'uuid-staff',
          fecha_modificacion: new Date('2026-10-07T14:00:00.000Z'),
          usuario: { correo: 'staff@unicesmag.edu.co' },
        },
      ]),
    );

    const respuesta = await pedir(firmar('uuid-staff', RolUsuario.STAFF)).expect(200);

    expect(respuesta.body).toEqual({
      radicado: SOLICITUD_E2E.radicado,
      eventos: [
        {
          id_log: 'uuid-log-1',
          enlace_campo: 'ANEXO',
          enlace_anterior: null,
          enlace_nuevo: 'https://drive.google.com/file/d/a/view',
          motivo_correccion: null,
          modificado_por: 'uuid-solicitante',
          fecha_modificacion: '2026-10-06T14:00:00.000Z',
        },
        {
          id_log: 'uuid-log-2',
          enlace_campo: 'ENTREGA',
          enlace_anterior: 'https://youtu.be/a',
          enlace_nuevo: 'https://youtu.be/b',
          motivo_correccion: 'El enlace apuntaba a un borrador.',
          modificado_por: 'uuid-staff',
          fecha_modificacion: '2026-10-07T14:00:00.000Z',
        },
      ],
    });
  });
});
