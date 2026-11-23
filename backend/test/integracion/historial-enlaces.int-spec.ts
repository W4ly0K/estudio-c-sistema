import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampoEnlace, CategoriaSolicitud, PrismaClient, RolUsuario, SubEspacio } from '@prisma/client';
import type { UsuarioAutenticado } from '../../src/auth/interfaces/usuario-autenticado.interface';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { DetalleSolicitudStaff } from '../../src/solicitudes/proyecciones/detalle-solicitud.proyeccion';
import { SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 9 · ADR-012 EV7 y D7 (lote J2b) · I-45 contra PostgreSQL REAL: historial de enlaces del Staff.
 *  - I-45a: ANEXO (escritos por editarAnexo real) y ENTREGA (insertado directo: J3 no existe aún), en
 *    orden ascendente y con exactamente los campos permitidos.
 *  - I-45b: historial y transiciones (logs del detalle del Staff) son conjuntos SEPARADOS y
 *    COMPLEMENTARIOS: ningún id_log en común y, juntos, todo Log_Auditoria de la solicitud.
 *  - I-45c: sin mezclar solicitudes; sin eventos → lista vacía; inexistente → 404.
 *  - I-45d: sin filtraciones al solicitante: 403 en el historial y su detalle sigue sin eventos ni anexos viejos.
 * Datos sintéticos de integración: nunca se tocan registros de producción.
 */
const AHORA = new Date('2026-10-05T10:00:00-05:00');
const STAFF: UsuarioAutenticado = { id: 'uuid-staff-i45', correo: 'staff-i45@prueba.local', rol: RolUsuario.STAFF };
const DUENO: UsuarioAutenticado = { id: 'uuid-solicitante-i45', correo: 'solicitante-i45@prueba.local', rol: RolUsuario.SOLICITANTE };
const CON_ANEXO = 'EC-I45-ANEXO';
const ENTREGADA = 'EC-I45-ENTREGA';
const SIN_EVENTOS = 'EC-I45-VACIA';
const A = 'https://drive.google.com/file/d/i45-a/view';
const B = 'https://drive.google.com/file/d/i45-b/view';
const ENTREGA_A = 'https://youtu.be/i45-a';
const ENTREGA_B = 'https://youtu.be/i45-b';
const MOTIVO = 'El enlace registrado apuntaba a un borrador.';
const CAMPOS = ['id_log', 'enlace_campo', 'enlace_anterior', 'enlace_nuevo', 'motivo_correccion', 'modificado_por', 'fecha_modificacion'];

describe('I-45 · historial de enlaces del Staff (integración · Fase 9 · ADR-012 EV7)', () => {
  let prisma: PrismaClient;
  let service: SolicitudesService;

  beforeAll(() => {
    prisma = crearPrismaDeIntegracion();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    service = new SolicitudesService(prisma as unknown as PrismaService, new RelojFijo(AHORA));
    await vaciarTablas(prisma);
    await prisma.usuario.createMany({
      data: [
        { id_usuario: STAFF.id, nombre: 'Staff I-45', correo: STAFF.correo, rol: RolUsuario.STAFF },
        { id_usuario: DUENO.id, nombre: 'Dueño I-45', correo: DUENO.correo, rol: RolUsuario.SOLICITANTE },
      ],
    });
    // Franjas distintas (CA-06); la entrega de PODCAST ya liberó la suya y lleva enlace (Fase 8).
    const base = { id_usuario: DUENO.id, sub_espacio: SubEspacio.ESTUDIO_COMPLETO };
    await prisma.solicitud.createMany({
      data: [
        { ...base, radicado: CON_ANEXO, categoria: CategoriaSolicitud.PODCAST, proposito: 'Con anexo (I-45)', estado: 'Recibido',
          fecha_inicio: new Date('2026-10-27T09:00:00-05:00'), fecha_fin: new Date('2026-10-27T10:00:00-05:00') },
        { ...base, radicado: ENTREGADA, categoria: CategoriaSolicitud.VIDEO, proposito: 'Entregada (I-45)', estado: 'Entregado',
          enlace_entrega: ENTREGA_B,
          fecha_inicio: new Date('2026-10-20T09:00:00-05:00'), fecha_fin: new Date('2026-10-20T10:00:00-05:00') },
        { ...base, radicado: SIN_EVENTOS, categoria: CategoriaSolicitud.STREAMING, proposito: 'Sin eventos (I-45)', estado: 'Recibido',
          fecha_inicio: new Date('2026-10-29T09:00:00-05:00'), fecha_fin: new Date('2026-10-29T10:00:00-05:00') },
      ],
    });
    // CON_ANEXO: dos eventos ANEXO por el servicio real (J2) y después la aprobación T1 (J1).
    await service.editarAnexo(CON_ANEXO, DUENO, { enlace_anexo_anterior: null, enlace_anexo: A });
    await service.editarAnexo(CON_ANEXO, DUENO, { enlace_anexo_anterior: A, enlace_anexo: B });
    await service.update(CON_ANEXO, { estado: 'Validado', anexo_revisado: B }, STAFF.id);
    // ENTREGADA: su camino de transiciones y una corrección de la entrega (insertada directo; J3 no existe).
    const camino = [
      ['Recibido', 'Validado', '2026-10-10T09:00:00-05:00'],
      ['Validado', 'En Producción', '2026-10-20T09:00:00-05:00'],
      ['En Producción', 'Edición y postproducción', '2026-10-20T11:00:00-05:00'],
      ['Edición y postproducción', 'Entregado', '2026-10-24T16:00:00-05:00'],
    ] as const;
    await prisma.log_Auditoria.createMany({
      data: camino.map(([estado_anterior, estado_nuevo, fecha]) => ({
        radicado_solicitud: ENTREGADA,
        estado_anterior,
        estado_nuevo,
        modificado_por: STAFF.id,
        fecha_modificacion: new Date(fecha),
      })),
    });
    await prisma.log_Auditoria.create({
      data: {
        radicado_solicitud: ENTREGADA,
        estado_anterior: 'Entregado',
        estado_nuevo: 'Entregado',
        modificado_por: STAFF.id,
        fecha_modificacion: new Date('2026-10-25T09:00:00-05:00'),
        enlace_campo: CampoEnlace.ENTREGA,
        enlace_anterior: ENTREGA_A,
        enlace_nuevo: ENTREGA_B,
        motivo_correccion: MOTIVO,
      },
    });
  });

  const capturar = async (operacion: Promise<unknown>): Promise<unknown> => {
    try {
      await operacion;
    } catch (error: unknown) {
      return error;
    }
    throw new Error('Se esperaba un rechazo');
  };
  const idsDe = (logs: readonly { id_log: string }[]) => logs.map((l) => l.id_log).sort();
  const todosLosIds = async (radicado: string) =>
    idsDe(await prisma.log_Auditoria.findMany({ where: { radicado_solicitud: radicado }, select: { id_log: true } }));

  it('I-45a · ANEXO y ENTREGA, en orden ascendente y con exactamente los campos permitidos', async () => {
    const anexo = await service.historialDeEnlaces(CON_ANEXO, STAFF);
    expect(anexo.radicado).toBe(CON_ANEXO);
    expect(anexo.eventos.map((e) => [e.enlace_campo, e.enlace_anterior, e.enlace_nuevo, e.modificado_por])).toEqual([
      [CampoEnlace.ANEXO, null, A, DUENO.id],
      [CampoEnlace.ANEXO, A, B, DUENO.id],
    ]);
    const fechas = anexo.eventos.map((e) => e.fecha_modificacion.getTime());
    expect(fechas).toEqual([...fechas].sort((x, y) => x - y));

    const entrega = await service.historialDeEnlaces(ENTREGADA, STAFF);
    expect(entrega.eventos).toEqual([
      expect.objectContaining({
        enlace_campo: CampoEnlace.ENTREGA,
        enlace_anterior: ENTREGA_A,
        enlace_nuevo: ENTREGA_B,
        motivo_correccion: MOTIVO,
        modificado_por: STAFF.id,
      }),
    ]);
    for (const evento of [...anexo.eventos, ...entrega.eventos]) expect(Object.keys(evento)).toEqual(CAMPOS);
  });

  it.each([
    [CON_ANEXO, 2, 1],
    [ENTREGADA, 1, 4],
  ])('I-45b · %s: historial (%i) y transiciones (%i) son conjuntos separados y complementarios', async (radicado, eventos, transiciones) => {
    const historial = idsDe((await service.historialDeEnlaces(radicado, STAFF)).eventos);
    const detalle = (await service.findOne(radicado, STAFF)) as DetalleSolicitudStaff;
    const deTransiciones = idsDe(detalle.logs);

    expect(historial).toHaveLength(eventos);
    expect(deTransiciones).toHaveLength(transiciones);
    expect(historial.filter((id) => deTransiciones.includes(id))).toEqual([]);
    expect([...historial, ...deTransiciones].sort()).toEqual(await todosLosIds(radicado));
  });

  it('I-45c · sin mezclar solicitudes; sin eventos → lista vacía; inexistente → 404', async () => {
    const deAnexo = idsDe((await service.historialDeEnlaces(CON_ANEXO, STAFF)).eventos);
    const deEntrega = idsDe((await service.historialDeEnlaces(ENTREGADA, STAFF)).eventos);
    expect(deAnexo.filter((id) => deEntrega.includes(id))).toEqual([]);

    expect(await service.historialDeEnlaces(SIN_EVENTOS, STAFF)).toEqual({ radicado: SIN_EVENTOS, eventos: [] });
    expect(await capturar(service.historialDeEnlaces('EC-I45-NO-EXISTE', STAFF))).toBeInstanceOf(NotFoundException);
  });

  it('I-45d · sin filtraciones al solicitante: 403 en el historial y su detalle sin eventos ni el anexo anterior', async () => {
    expect(await capturar(service.historialDeEnlaces(CON_ANEXO, DUENO))).toBeInstanceOf(ForbiddenException);

    const detalle = await service.findOne(CON_ANEXO, DUENO);
    expect(detalle.logs).toHaveLength(1);
    expect(detalle.logs[0]).toMatchObject({ estado_anterior: 'Recibido', estado_nuevo: 'Validado' });
    for (const log of detalle.logs) {
      for (const campo of ['id_log', 'enlace_campo', 'enlace_anterior', 'enlace_nuevo', 'motivo_correccion', 'modificado_por']) {
        expect(log).not.toHaveProperty(campo);
      }
    }
    const texto = JSON.stringify(detalle);
    expect(texto).toContain(B); // su anexo VIGENTE sí lo ve (AN15)
    expect(texto).not.toContain(A); // el anexo anterior (historial) no
  });
});
