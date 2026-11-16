import { INestApplication } from '@nestjs/common';
import { CategoriaSolicitud, RolUsuario } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { ENLACE_MAXIMO } from '../src/common/validadores/enlace-seguro.decorator';
import { MENSAJE_ENLACE_ENTREGA } from '../src/solicitudes/dto/update-solicitude.dto';
import { MENSAJE_ENTREGA_ANTERIOR_FORMA, MENSAJE_MOTIVO_CORRECCION } from '../src/solicitudes/dto/corregir-enlace-entrega.dto';
import {
  MENSAJE_CORRECCION_NO_APLICA,
  MENSAJE_ENLACE_SOLO_AL_ENTREGAR,
  MENSAJE_ENTREGA_SIN_ENLACE_PREVIO,
  MENSAJE_SOLICITUD_NO_ENCONTRADA,
  SolicitudesService,
} from '../src/solicitudes/solicitudes.service';
import { enlaceConEmojisDeUnidadesUtf16, enlaceConSelectoresDeVariacion } from './utils/casos-enlace';
import { crearAppE2E, PrismaMockE2E, SOLICITUD_E2E } from './utils/crear-app-e2e';

/**
 * Fase 9 · ADR-008 EN6 a EN12 (lote J3) · PATCH /solicitudes/:radicado/enlace-entrega por HTTP real
 * (JWT, guards, ValidationPipe, controlador y servicio de producción), con Prisma simulado.
 * EN8 (entrega sin enlace previo) solo existe en filas históricas (la restricción NOT VALID rige para
 * toda fila nueva): aquí se cubre con el mock, sin fabricar datos inválidos en ninguna base.
 */
describe('Corrección del enlace de entrega (e2e · Fase 9 · J3)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaMockE2E;
  let firmar: (sub: string, rol: RolUsuario) => string;

  const A = 'https://youtu.be/entrega-a';
  const B = 'https://youtu.be/entrega-b';
  const RUTA = `/solicitudes/${SOLICITUD_E2E.radicado}/enlace-entrega`;

  // Fase 9 · H8b-2 · Más de ENLACE_MAXIMO puntos de código con un selector de variación (el pipe rechaza solo por la
  // longitud) y emojis que superan ENLACE_MAXIMO unidades UTF-16 sin superar los puntos de código (se acepta).
  const SELECTORES_FUERA_DEL_LIMITE = [
    ['U+FE0F', enlaceConSelectoresDeVariacion(ENLACE_MAXIMO + 1, 1, '\uFE0F')],
    ['U+FE0E', enlaceConSelectoresDeVariacion(ENLACE_MAXIMO + 1, 1, '\uFE0E')],
  ] as const;
  const EMOJIS_DENTRO_DEL_LIMITE = enlaceConEmojisDeUnidadesUtf16(ENLACE_MAXIMO + 2);

  const corregir = (body: object, token?: string, ruta = RUTA) => {
    const peticion = request(app.getHttpServer()).patch(ruta);
    return (token === undefined ? peticion : peticion.set('Authorization', `Bearer ${token}`)).send(body);
  };
  const staff = () => firmar('uuid-staff', RolUsuario.STAFF);
  const entregado = (enlace_entrega: string | null) =>
    prisma.solicitud.findUnique.mockResolvedValueOnce({
      ...SOLICITUD_E2E,
      categoria: CategoriaSolicitud.PODCAST,
      estado: 'Entregado',
      enlace_entrega,
    });

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
    await corregir({ enlace_entrega_anterior: A, enlace_entrega: B }).expect(401);

    expect(prisma.solicitud.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['el solicitante dueño', 'uuid-solicitante', RolUsuario.SOLICITANTE],
    ['un usuario degradado cuyo token todavía dice STAFF (el rol sale de la base)', 'uuid-degradado', RolUsuario.STAFF],
  ])('%s → 403, sin consultar', async (_caso, sub, rolDelToken) => {
    await corregir({ enlace_entrega_anterior: A, enlace_entrega: B }, firmar(sub, rolDelToken)).expect(403);

    expect(prisma.solicitud.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['sin enlace_entrega_anterior', { enlace_entrega: B }, MENSAJE_ENTREGA_ANTERIOR_FORMA],
    ['un enlace nuevo inseguro (http)', { enlace_entrega_anterior: A, enlace_entrega: 'http://youtu.be/b' }, MENSAJE_ENLACE_ENTREGA],
    ['un enlace nuevo null (no se retira)', { enlace_entrega_anterior: A, enlace_entrega: null }, MENSAJE_ENLACE_ENTREGA],
    ['motivo null', { enlace_entrega_anterior: A, enlace_entrega: B, motivo_correccion: null }, MENSAJE_MOTIVO_CORRECCION],
    ['motivo de 9 caracteres', { enlace_entrega_anterior: A, enlace_entrega: B, motivo_correccion: 'corto9chr' }, MENSAJE_MOTIVO_CORRECCION],
  ])('%s → 400 del pipe, sin consultar', async (_caso, body, mensaje) => {
    const respuesta = await corregir(body, staff()).expect(400);

    expect(JSON.stringify(respuesta.body)).toContain(mensaje);
    expect(prisma.solicitud.findUnique).not.toHaveBeenCalled();
  });

  it('radicado inexistente → 404 uniforme', async () => {
    prisma.solicitud.findUnique.mockResolvedValueOnce(null);

    const respuesta = await corregir({ enlace_entrega_anterior: A, enlace_entrega: B }, staff(), '/solicitudes/EC-2099-9999/enlace-entrega').expect(404);

    expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_SOLICITUD_NO_ENCONTRADA);
  });

  it('ESPACIOS → 400 de categoría, sin transacción', async () => {
    const respuesta = await corregir({ enlace_entrega_anterior: A, enlace_entrega: B }, staff()).expect(400);

    expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_CORRECCION_NO_APLICA);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('EN8 · PODCAST entregado sin enlace previo → 409, sin transacción', async () => {
    entregado(null);

    const respuesta = await corregir({ enlace_entrega_anterior: A, enlace_entrega: B }, staff()).expect(409);

    expect(JSON.stringify(respuesta.body)).toContain(MENSAJE_ENTREGA_SIN_ENLACE_PREVIO);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('corrección → 200: compare-and-set sin estado y evento ENLACE_ENTREGA con el motivo recortado', async () => {
    entregado(A);

    const respuesta = await corregir(
      { enlace_entrega_anterior: A, enlace_entrega: B, motivo_correccion: '  El enlace apuntaba a un borrador.  ' },
      staff(),
    ).expect(200);

    expect(respuesta.body).toMatchObject({ sin_cambios: false });
    expect(prisma.solicitud.updateMany).toHaveBeenCalledWith({
      where: { radicado: SOLICITUD_E2E.radicado, estado: 'Entregado', enlace_entrega: A },
      data: { enlace_entrega: B },
    });
    expect(prisma.log_Auditoria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        enlace_campo: 'ENTREGA',
        enlace_anterior: A,
        enlace_nuevo: B,
        motivo_correccion: 'El enlace apuntaba a un borrador.',
        modificado_por: 'uuid-staff',
      }),
    });
  });

  // Fase 9 · H8b-2 · el pipe rechaza por longitud ANTES del servicio: ni el servicio ni Prisma se invocan.
  it.each(SELECTORES_FUERA_DEL_LIMITE)(
    `H8b · un enlace nuevo con selector %s de ${ENLACE_MAXIMO + 1} puntos de código → 400 del pipe, sin llegar al servicio`,
    async (_selector, enlace) => {
      const servicio = jest.spyOn(SolicitudesService.prototype, 'corregirEnlaceEntrega');
      try {
        const respuesta = await corregir({ enlace_entrega_anterior: A, enlace_entrega: enlace }, staff()).expect(400);

        expect(respuesta.body.message).toEqual([MENSAJE_ENLACE_ENTREGA]);
        expect(servicio).not.toHaveBeenCalled();
        expect(prisma.solicitud.findUnique).not.toHaveBeenCalled();
        expect(prisma.solicitud.updateMany).not.toHaveBeenCalled();
        expect(prisma.log_Auditoria.create).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      } finally {
        servicio.mockRestore();
      }
    },
  );

  it(`H8b · corrección a un enlace de emojis (más de ${ENLACE_MAXIMO} unidades UTF-16) → 200 y se escribe tal cual`, async () => {
    entregado(A);

    await corregir({ enlace_entrega_anterior: A, enlace_entrega: EMOJIS_DENTRO_DEL_LIMITE }, staff()).expect(200);

    expect(prisma.solicitud.updateMany).toHaveBeenCalledWith({
      where: { radicado: SOLICITUD_E2E.radicado, estado: 'Entregado', enlace_entrega: A },
      data: { enlace_entrega: EMOJIS_DENTRO_DEL_LIMITE },
    });
  });

  it('el mismo enlace → 200 sin_cambios, sin transacción', async () => {
    entregado(B);
    prisma.solicitud.findUnique.mockResolvedValueOnce({ ...SOLICITUD_E2E, estado: 'Entregado', enlace_entrega: B });

    const respuesta = await corregir({ enlace_entrega_anterior: B, enlace_entrega: B }, staff()).expect(200);

    expect(respuesta.body).toMatchObject({ sin_cambios: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('regresión: el PATCH del tablero con enlace_entrega sobre una entrega sigue respondiendo 400', async () => {
    entregado(A);

    const respuesta = await request(app.getHttpServer())
      .patch(`/solicitudes/${SOLICITUD_E2E.radicado}`)
      .set('Authorization', `Bearer ${staff()}`)
      .send({ enlace_entrega: B })
      .expect(400);

    // El mensaje lleva comillas («"Entregado"»): se compara el campo, no el JSON serializado (que las escapa).
    expect(respuesta.body.message).toBe(MENSAJE_ENLACE_SOLO_AL_ENTREGAR);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
