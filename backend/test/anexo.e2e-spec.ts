import { INestApplication } from '@nestjs/common';
import { CategoriaSolicitud, RolUsuario, SubEspacio } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { ENLACE_MAXIMO } from '../src/common/validadores/enlace-seguro.decorator';
import { MENSAJE_ENLACE_ANEXO } from '../src/solicitudes/dto/create-solicitude.dto';
import { MENSAJE_ANEXO_REVISADO_FORMA } from '../src/solicitudes/dto/update-solicitude.dto';
import { MENSAJE_ANEXO_ANTERIOR_FORMA } from '../src/solicitudes/dto/editar-anexo.dto';
import {
  MENSAJE_ANEXO_NO_APLICA,
  MENSAJE_ANEXO_REVISADO_NO_APLICA,
  MENSAJE_ANEXO_REVISADO_OBLIGATORIO,
  MENSAJE_SOLICITUD_NO_ENCONTRADA,
  SolicitudesService,
} from '../src/solicitudes/solicitudes.service';
import { enlaceConEmojisDeUnidadesUtf16, enlaceConSelectoresDeVariacion } from './utils/casos-enlace';
import { crearAppE2E, PrismaMockE2E, SOLICITUD_AJENA_E2E, SOLICITUD_E2E } from './utils/crear-app-e2e';

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

  // Fase 9 · H8b-2 · Más de ENLACE_MAXIMO puntos de código con un selector de variación (el pipe rechaza solo por la
  // longitud) y emojis que superan ENLACE_MAXIMO unidades UTF-16 sin superar los puntos de código (se acepta).
  const SELECTORES_FUERA_DEL_LIMITE = [
    ['U+FE0F', enlaceConSelectoresDeVariacion(ENLACE_MAXIMO + 1, 1, '\uFE0F')],
    ['U+FE0E', enlaceConSelectoresDeVariacion(ENLACE_MAXIMO + 1, 1, '\uFE0E')],
  ] as const;
  const EMOJIS_DENTRO_DEL_LIMITE = enlaceConEmojisDeUnidadesUtf16(ENLACE_MAXIMO + 2);

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

  // Fase 9 · H8b-2 · el pipe rechaza por longitud ANTES del servicio: ni el servicio ni Prisma se invocan.
  it.each(SELECTORES_FUERA_DEL_LIMITE)(
    `H8b · POST con un anexo con selector %s de ${ENLACE_MAXIMO + 1} puntos de código → 400 del pipe, sin llegar al servicio`,
    async (_selector, enlace) => {
      const servicio = jest.spyOn(SolicitudesService.prototype, 'create');
      try {
        const respuesta = await radicar({ ...cuerpo, enlace_anexo: enlace }).expect(400);

        expect(respuesta.body.message).toEqual([MENSAJE_ENLACE_ANEXO]);
        expect(servicio).not.toHaveBeenCalled();
        expect(prisma.solicitud.findFirst).not.toHaveBeenCalled();
        expect(prisma.solicitud.create).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      } finally {
        servicio.mockRestore();
      }
    },
  );

  it(`H8b · POST con un anexo de emojis (más de ${ENLACE_MAXIMO} unidades UTF-16, menos puntos de código) → 201 y se persiste tal cual`, async () => {
    await radicar({ ...cuerpo, enlace_anexo: EMOJIS_DENTRO_DEL_LIMITE }).expect(201);

    expect(prisma.solicitud.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ enlace_anexo: EMOJIS_DENTRO_DEL_LIMITE }) }),
    );
  });

  it.each([
    ['ESPACIOS', { categoria: CategoriaSolicitud.ESPACIOS, sub_espacio: SubEspacio.CABINA_AUDIO }],
    ['ASESORIAS', { categoria: CategoriaSolicitud.ASESORIAS }],
  ])('A6. POST de %s con anexo → 400 del servicio (AN2b), sin consultar ni escribir', async (_caso, categoria) => {
    const respuesta = await radicar({ ...cuerpo, ...categoria, enlace_anexo: ANEXO }).expect(400);

    expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_ANEXO_NO_APLICA);
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

  describe('A7. E7 · anexo_revisado al aprobar (Fase 9 · ADR-005 E7)', () => {
    const aprobar = (body: object) =>
      request(app.getHttpServer())
        .patch(`/solicitudes/${SOLICITUD_E2E.radicado}`)
        .set('Authorization', `Bearer ${tokenStaff}`)
        .send({ estado: 'Validado', ...body });
    const podcastSinAnexo = () =>
      prisma.solicitud.findUnique.mockResolvedValueOnce({ ...SOLICITUD_E2E, categoria: CategoriaSolicitud.PODCAST });

    it('PODCAST sin anexo_revisado → 400 OBLIGATORIO, sin transacción', async () => {
      podcastSinAnexo();

      const respuesta = await aprobar({}).expect(400);

      expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_ANEXO_REVISADO_OBLIGATORIO);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('PODCAST sin anexo y anexo_revisado null → 200; el compare-and-set exige enlace_anexo: null', async () => {
      podcastSinAnexo();

      await aprobar({ anexo_revisado: null }).expect(200);

      expect(prisma.solicitud.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ estado: 'Recibido', enlace_anexo: null }) }),
      );
    });

    it.each([
      ['la cadena vacía', ''],
      ['solo espacios', '   '],
    ])('anexo_revisado con %s → 400 del pipe, sin leer ni escribir', async (_caso, valor) => {
      const respuesta = await aprobar({ anexo_revisado: valor }).expect(400);

      expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_ANEXO_REVISADO_FORMA);
      expect(prisma.solicitud.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ESPACIOS con anexo_revisado null → 400 NO_APLICA, sin transacción', async () => {
      const respuesta = await aprobar({ anexo_revisado: null }).expect(400);

      expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_ANEXO_REVISADO_NO_APLICA);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('A8. PATCH /solicitudes/:radicado/anexo (Fase 9 · ADR-009 AN10 a AN14)', () => {
    const editar = (radicado: string, body: object, token?: string) => {
      const peticion = request(app.getHttpServer()).patch(`/solicitudes/${radicado}/anexo`);
      return (token === undefined ? peticion : peticion.set('Authorization', `Bearer ${token}`)).send(body);
    };
    const podcastSinAnexo = () =>
      prisma.solicitud.findFirst.mockResolvedValueOnce({ ...SOLICITUD_E2E, categoria: CategoriaSolicitud.PODCAST });

    it('sin token → 401, sin consultar', async () => {
      await editar(SOLICITUD_E2E.radicado, { enlace_anexo_anterior: null, enlace_anexo: ANEXO }).expect(401);

      expect(prisma.solicitud.findFirst).not.toHaveBeenCalled();
    });

    it('con token de Staff → 403, sin consultar (el Staff nunca edita el anexo del solicitante)', async () => {
      await editar(SOLICITUD_E2E.radicado, { enlace_anexo_anterior: null, enlace_anexo: ANEXO }, tokenStaff).expect(403);

      expect(prisma.solicitud.findFirst).not.toHaveBeenCalled();
    });

    it('sin enlace_anexo_anterior → 400 del pipe, sin consultar', async () => {
      const respuesta = await editar(SOLICITUD_E2E.radicado, { enlace_anexo: ANEXO }, tokenSolicitante).expect(400);

      expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_ANEXO_ANTERIOR_FORMA);
      expect(prisma.solicitud.findFirst).not.toHaveBeenCalled();
    });

    it('una solicitud ajena → 404 uniforme, sin escribir', async () => {
      const respuesta = await editar(SOLICITUD_AJENA_E2E.radicado, { enlace_anexo_anterior: null, enlace_anexo: ANEXO }, tokenSolicitante).expect(404);

      expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_SOLICITUD_NO_ENCONTRADA);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ESPACIOS (propia) → 400 de categoría, sin escribir', async () => {
      const respuesta = await editar(SOLICITUD_E2E.radicado, { enlace_anexo_anterior: null, enlace_anexo: ANEXO }, tokenSolicitante).expect(400);

      expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_ANEXO_NO_APLICA);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('PODCAST propio: agregar → 200, compare-and-set con el dueño y evento ENLACE_ANEXO', async () => {
      podcastSinAnexo();

      const respuesta = await editar(SOLICITUD_E2E.radicado, { enlace_anexo_anterior: null, enlace_anexo: ANEXO }, tokenSolicitante).expect(200);

      expect(respuesta.body).toMatchObject({ sin_cambios: false });
      expect(prisma.solicitud.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id_usuario: 'uuid-solicitante', estado: 'Recibido', enlace_anexo: null }),
          data: { enlace_anexo: ANEXO },
        }),
      );
      expect(prisma.log_Auditoria.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ enlace_campo: 'ANEXO', enlace_anterior: null, enlace_nuevo: ANEXO, modificado_por: 'uuid-solicitante' }),
      });
    });

    // Fase 9 · H8b-2 · el pipe rechaza por longitud ANTES del servicio: ni el servicio ni Prisma se invocan.
    it.each(SELECTORES_FUERA_DEL_LIMITE)(
      `H8b · un anexo con selector %s de ${ENLACE_MAXIMO + 1} puntos de código → 400 del pipe, sin llegar al servicio`,
      async (_selector, enlace) => {
        const servicio = jest.spyOn(SolicitudesService.prototype, 'editarAnexo');
        try {
          const respuesta = await editar(SOLICITUD_E2E.radicado, { enlace_anexo_anterior: null, enlace_anexo: enlace }, tokenSolicitante).expect(400);

          expect(respuesta.body.message).toEqual([MENSAJE_ENLACE_ANEXO]);
          expect(servicio).not.toHaveBeenCalled();
          expect(prisma.solicitud.findFirst).not.toHaveBeenCalled();
          expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
          expect(prisma.$transaction).not.toHaveBeenCalled();
        } finally {
          servicio.mockRestore();
        }
      },
    );

    it(`H8b · PODCAST propio: agregar un anexo de emojis (más de ${ENLACE_MAXIMO} unidades UTF-16) → 200 y se escribe tal cual`, async () => {
      podcastSinAnexo();

      await editar(SOLICITUD_E2E.radicado, { enlace_anexo_anterior: null, enlace_anexo: EMOJIS_DENTRO_DEL_LIMITE }, tokenSolicitante).expect(200);

      expect(prisma.solicitud.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { enlace_anexo: EMOJIS_DENTRO_DEL_LIMITE } }),
      );
    });

    it('PODCAST propio sin anexo con null y null → 200 sin_cambios, sin transacción', async () => {
      podcastSinAnexo();

      const respuesta = await editar(SOLICITUD_E2E.radicado, { enlace_anexo_anterior: null, enlace_anexo: null }, tokenSolicitante).expect(200);

      expect(respuesta.body).toMatchObject({ sin_cambios: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
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
