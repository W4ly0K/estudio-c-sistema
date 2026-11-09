import { INestApplication } from '@nestjs/common';
import { CategoriaSolicitud, RolUsuario } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { MENSAJE_ENLACE_ANEXO } from '../src/solicitudes/dto/create-solicitude.dto';
import { crearAppE2E, PrismaMockE2E, SOLICITUD_E2E } from './utils/crear-app-e2e';

/**
 * Fase 9 · R9-1 · el anexo opcional del solicitante por HTTP real: JWT, guards, ValidationPipe,
 * controlador y servicio de producción, con Prisma simulado (los e2e nunca tocan Supabase). El
 * motor (CHECK) lo cubre I-38 en la integración.
 */
describe('Anexo del solicitante (e2e · Fase 9 · R9-1)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaMockE2E;
  let tokenSolicitante: string;
  let tokenStaff: string;

  const ANEXO = 'https://drive.google.com/file/d/xyz/view';

  // Un servicio (sin sub-espacio) en una franja válida con el "ahora" de crearAppE2E.
  const cuerpo = {
    categoria: CategoriaSolicitud.VIDEO,
    proposito: 'Grabación con guion adjunto',
    fecha_inicio: '2026-10-13T14:00:00-05:00',
    fecha_fin: '2026-10-13T15:00:00-05:00',
  };

  const radicar = (body: object) =>
    request(app.getHttpServer())
      .post('/solicitudes')
      .set('Authorization', `Bearer ${tokenSolicitante}`)
      .send(body);

  beforeAll(async () => {
    let firmar: (sub: string, rol: RolUsuario) => string;
    ({ app, prisma, firmar } = await crearAppE2E());
    tokenSolicitante = firmar('uuid-solicitante', RolUsuario.SOLICITANTE);
    tokenStaff = firmar('uuid-staff', RolUsuario.STAFF);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('A1. POST con un anexo válido → 201 y el servicio lo persiste tal cual', async () => {
    await radicar({ ...cuerpo, enlace_anexo: ANEXO }).expect(201);

    expect(prisma.solicitud.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ enlace_anexo: ANEXO }) }),
    );
  });

  it('A2. POST sin anexo → 201 y se escribe NULL explícito', async () => {
    await radicar(cuerpo).expect(201);

    expect(prisma.solicitud.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ enlace_anexo: null }) }),
    );
  });

  it.each([
    ['HTTPS en mayúsculas', 'HTTPS://drive.google.com/file/d/xyz/view'],
    ['la cadena vacía (no se convierte en NULL)', ''],
    ['con un espacio al inicio', ` ${ANEXO}`],
    ['javascript:', 'javascript:alert(1)'],
  ])('A3. POST con %s → 400 del pipe, sin consultar ni escribir', async (_caso, enlace) => {
    const respuesta = await radicar({ ...cuerpo, enlace_anexo: enlace }).expect(400);

    expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_ENLACE_ANEXO);
    expect(prisma.solicitud.findFirst).not.toHaveBeenCalled();
    expect(prisma.solicitud.create).not.toHaveBeenCalled();
  });

  it('A4. PATCH del Staff con enlace_anexo → 400 "should not exist" sin leer ni escribir (regla de auditoría)', async () => {
    const respuesta = await request(app.getHttpServer())
      .patch(`/solicitudes/${SOLICITUD_E2E.radicado}`)
      .set('Authorization', `Bearer ${tokenStaff}`)
      .send({ estado: 'Validado', enlace_anexo: ANEXO })
      .expect(400);

    expect(JSON.stringify(respuesta.body)).toContain('property enlace_anexo should not exist');
    expect(prisma.solicitud.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('A5. GET del dueño: pide el anexo en la proyección y lo devuelve', async () => {
    prisma.solicitud.findFirst.mockResolvedValueOnce({ ...SOLICITUD_E2E, enlace_anexo: ANEXO });

    const respuesta = await request(app.getHttpServer())
      .get(`/solicitudes/${SOLICITUD_E2E.radicado}`)
      .set('Authorization', `Bearer ${tokenSolicitante}`)
      .expect(200);

    expect(JSON.stringify(respuesta.body)).toContain(ANEXO);
    expect(prisma.solicitud.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ enlace_anexo: true }) }),
    );
  });
});
