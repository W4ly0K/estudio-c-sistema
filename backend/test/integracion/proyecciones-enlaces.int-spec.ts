import { CampoEnlace, CategoriaSolicitud, PrismaClient, RolUsuario, SubEspacio } from '@prisma/client';
import type { UsuarioAutenticado } from '../../src/auth/interfaces/usuario-autenticado.interface';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 9 · ADR-012 EV7 (lote I-2) · I-41 contra PostgreSQL REAL: COMPORTAMIENTO OBSERVABLE.
 * Con un evento de enlace válido insertado directamente (como I-40, porque todavía no hay endpoints),
 * el detalle que devuelve el servicio al Staff y al solicitante es IDÉNTICO al de antes del evento:
 * mismas transiciones en `logs` (base de la línea de vida) y mismos datos de la solicitud. El evento
 * sigue guardado en Log_Auditoria, con sus valores.
 *  - I-41a: evento ENTREGA después de la entrega (T12): la fecha de «Entregado» no se mueve.
 *  - I-41b: evento ANEXO en «Recibido»: `logs` sigue vacío.
 * Datos sintéticos de integración: nunca se tocan registros de producción.
 */
const STAFF: UsuarioAutenticado = { id: 'uuid-staff-i41', correo: 'staff-i41@prueba.local', rol: RolUsuario.STAFF };
const SOLICITANTE: UsuarioAutenticado = {
  id: 'uuid-solicitante-i41',
  correo: 'solicitante-i41@prueba.local',
  rol: RolUsuario.SOLICITANTE,
};
const RADICADO_ENTREGADO = 'EC-I41-ENTREGADO';
const RADICADO_RECIBIDO = 'EC-I41-RECIBIDO';
const ENTREGA_A = 'https://youtu.be/entrega-i41-a';
const ENTREGA_B = 'https://youtu.be/entrega-i41-b';
const ANEXO_A = 'https://drive.google.com/file/d/i41-a/view';
const ANEXO_B = 'https://drive.google.com/file/d/i41-b/view';
const MOTIVO = 'El enlace registrado apuntaba a un borrador del video';
const AHORA = new Date('2026-11-11T10:00:00-05:00');

/** El camino de un PODCAST hasta la entrega (T1, T3, T11 y T12), con fechas crecientes. */
const TRANSICIONES_HASTA_LA_ENTREGA = [
  ['Recibido', 'Validado', '2026-10-20T09:00:00-05:00'],
  ['Validado', 'En Producción', '2026-10-28T09:00:00-05:00'],
  ['En Producción', 'Edición y postproducción', '2026-10-28T11:00:00-05:00'],
  ['Edición y postproducción', 'Entregado', '2026-11-04T16:00:00-05:00'],
] as const;

describe('I-41 · proyecciones de detalle con eventos de enlace (integración · Fase 9 · ADR-012 EV7)', () => {
  let prisma: PrismaClient;
  let service: SolicitudesService;

  beforeAll(() => {
    prisma = crearPrismaDeIntegracion();
    service = new SolicitudesService(prisma as unknown as PrismaService, new RelojFijo(AHORA));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await vaciarTablas(prisma);
    await prisma.usuario.createMany({
      data: [
        { id_usuario: STAFF.id, nombre: 'Staff I-41', correo: STAFF.correo, rol: RolUsuario.STAFF },
        { id_usuario: SOLICITANTE.id, nombre: 'Solicitante I-41', correo: SOLICITANTE.correo, rol: RolUsuario.SOLICITANTE },
      ],
    });
    // Franjas distintas (CA-06); la entrega de PODCAST ya liberó la suya y lleva enlace (Fase 8).
    await prisma.solicitud.createMany({
      data: [
        {
          radicado: RADICADO_ENTREGADO,
          id_usuario: SOLICITANTE.id,
          categoria: CategoriaSolicitud.PODCAST,
          proposito: 'Pódcast entregado (I-41)',
          fecha_inicio: new Date('2026-10-28T09:00:00-05:00'),
          fecha_fin: new Date('2026-10-28T10:00:00-05:00'),
          estado: 'Entregado',
          sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
          enlace_entrega: ENTREGA_A,
        },
        {
          radicado: RADICADO_RECIBIDO,
          id_usuario: SOLICITANTE.id,
          categoria: CategoriaSolicitud.PODCAST,
          proposito: 'Pódcast en Recibido con anexo (I-41)',
          fecha_inicio: new Date('2026-11-25T09:00:00-05:00'),
          fecha_fin: new Date('2026-11-25T10:00:00-05:00'),
          estado: 'Recibido',
          sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
          enlace_anexo: ANEXO_A,
        },
      ],
    });
    await prisma.log_Auditoria.createMany({
      data: TRANSICIONES_HASTA_LA_ENTREGA.map(([estado_anterior, estado_nuevo, fecha]) => ({
        radicado_solicitud: RADICADO_ENTREGADO,
        estado_anterior,
        estado_nuevo,
        modificado_por: STAFF.id,
        fecha_modificacion: new Date(fecha),
      })),
    });
  });

  /** El detalle que ve cada rol, por el mismo camino que GET /solicitudes/:radicado. */
  const detalles = async (radicado: string) => ({
    staff: await service.findOne(radicado, STAFF),
    solicitante: await service.findOne(radicado, SOLICITANTE),
  });

  it('I-41a · un evento ENTREGA no cambia el detalle de ninguno de los dos roles y queda guardado', async () => {
    const antes = await detalles(RADICADO_ENTREGADO);
    expect(antes.staff.logs.map((log) => log.estado_nuevo)).toEqual(TRANSICIONES_HASTA_LA_ENTREGA.map((t) => t[1]));
    expect(antes.solicitante.logs).toHaveLength(TRANSICIONES_HASTA_LA_ENTREGA.length);

    // Posterior a T12: sin el filtro, sería el último log con estado_nuevo «Entregado».
    await prisma.log_Auditoria.create({
      data: {
        radicado_solicitud: RADICADO_ENTREGADO,
        estado_anterior: 'Entregado',
        estado_nuevo: 'Entregado',
        modificado_por: STAFF.id,
        fecha_modificacion: new Date('2026-11-10T08:00:00-05:00'),
        enlace_campo: CampoEnlace.ENTREGA,
        enlace_anterior: ENTREGA_A,
        enlace_nuevo: ENTREGA_B,
        motivo_correccion: MOTIVO,
      },
    });

    expect(await detalles(RADICADO_ENTREGADO)).toEqual(antes);
    expect(
      await prisma.log_Auditoria.findMany({
        where: { radicado_solicitud: RADICADO_ENTREGADO, enlace_campo: { not: null } },
        select: { estado_anterior: true, estado_nuevo: true, enlace_campo: true, enlace_anterior: true, enlace_nuevo: true, motivo_correccion: true },
      }),
    ).toEqual([
      {
        estado_anterior: 'Entregado',
        estado_nuevo: 'Entregado',
        enlace_campo: CampoEnlace.ENTREGA,
        enlace_anterior: ENTREGA_A,
        enlace_nuevo: ENTREGA_B,
        motivo_correccion: MOTIVO,
      },
    ]);
    expect(await prisma.log_Auditoria.count({ where: { radicado_solicitud: RADICADO_ENTREGADO } })).toBe(
      TRANSICIONES_HASTA_LA_ENTREGA.length + 1,
    );
  });

  it('I-41b · un evento ANEXO en «Recibido» no aparece en logs de ninguno de los dos roles y queda guardado', async () => {
    const antes = await detalles(RADICADO_RECIBIDO);
    expect(antes.staff.logs).toEqual([]);
    expect(antes.solicitante.logs).toEqual([]);

    await prisma.log_Auditoria.create({
      data: {
        radicado_solicitud: RADICADO_RECIBIDO,
        estado_anterior: 'Recibido',
        estado_nuevo: 'Recibido',
        modificado_por: SOLICITANTE.id,
        enlace_campo: CampoEnlace.ANEXO,
        enlace_anterior: ANEXO_A,
        enlace_nuevo: ANEXO_B,
      },
    });

    expect(await detalles(RADICADO_RECIBIDO)).toEqual(antes);
    expect(
      await prisma.log_Auditoria.findMany({
        where: { radicado_solicitud: RADICADO_RECIBIDO },
        select: { estado_anterior: true, estado_nuevo: true, modificado_por: true, enlace_campo: true, enlace_anterior: true, enlace_nuevo: true },
      }),
    ).toEqual([
      {
        estado_anterior: 'Recibido',
        estado_nuevo: 'Recibido',
        modificado_por: SOLICITANTE.id,
        enlace_campo: CampoEnlace.ANEXO,
        enlace_anterior: ANEXO_A,
        enlace_nuevo: ANEXO_B,
      },
    ]);
  });
});
