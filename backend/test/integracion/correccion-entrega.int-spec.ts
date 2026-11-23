import { ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { CampoEnlace, CategoriaSolicitud, PrismaClient, RolUsuario, SubEspacio } from '@prisma/client';
import type { UsuarioAutenticado } from '../../src/auth/interfaces/usuario-autenticado.interface';
import type { PrismaService } from '../../src/prisma/prisma.service';
import {
  MENSAJE_CAMBIO_CONCURRENTE,
  MENSAJE_CORRECCION_SOLO_EN_ENTREGADO,
  SolicitudesService,
} from '../../src/solicitudes/solicitudes.service';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 9 · ADR-008 EN6 a EN12 y ADR-012 (lote J3) · I-43 contra PostgreSQL REAL.
 *  - I-43a: AUDITORÍA. Una corrección cambia el enlace, deja el estado en «Entregado», escribe UN evento
 *    ENLACE_ENTREGA con el motivo y ninguna transición; el historial (J2b) lo muestra y los logs de los
 *    detalles no cambian.
 *  - I-43b: sin motivo → motivo_correccion NULL en el evento.
 *  - I-43c: B9 en el motor con 10 y 500 caracteres reales (incluido un emoji).
 *  - I-43d a I-43f: sin_cambios con el anterior desactualizado, fuera de «Entregado» y un SOLICITANTE (403).
 *  - I-43g y I-43h: CONCURRENCIA. Compare-and-set perdido y dos correcciones a la vez con barrera.
 * EN8 (entrega sin enlace previo) NO se siembra: Solicitud_entrega_con_enlace_check (NOT VALID) rige para
 * toda fila nueva o actualizada y no se fabrican datos inválidos; EN8 lo cubren las unitarias y el e2e.
 * El servicio recibe aquí el cuerpo ya validado (la forma del motivo la prueba el DTO).
 * Datos sintéticos de integración: nunca se tocan registros de producción.
 */
const AHORA = new Date('2026-11-12T10:00:00-05:00');
const STAFF: UsuarioAutenticado = { id: 'uuid-staff-i43', correo: 'staff-i43@prueba.local', rol: RolUsuario.STAFF };
const DUENO: UsuarioAutenticado = { id: 'uuid-solicitante-i43', correo: 'solicitante-i43@prueba.local', rol: RolUsuario.SOLICITANTE };
const RADICADO = 'EC-I43-PODCAST';
const A = 'https://youtu.be/i43-a';
const B = 'https://youtu.be/i43-b';
const C = 'https://youtu.be/i43-c';
const MOTIVO = 'El enlace registrado apuntaba a un borrador.';

interface PuntosDePrueba {
  escribirConCompareAndSet: (op: unknown) => Promise<unknown>;
}

/** Barrera de n participantes con límite de tiempo (mismo patrón que maquina-concurrencia). */
function crearBarrera(participantes: number, limiteMs = 5000): () => Promise<void> {
  let llegados = 0;
  let abrir: () => void = () => undefined;
  const abierta = new Promise<void>((resolver) => {
    abrir = resolver;
  });
  return async () => {
    llegados += 1;
    if (llegados === participantes) abrir();
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<never>((_resolver, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error(`Barrera: llegaron ${llegados} de ${participantes}`)), limiteMs);
    });
    try {
      await Promise.race([abierta, limite]);
    } finally {
      clearTimeout(temporizador);
    }
  };
}

describe('I-43 · corrección del enlace de entrega por el Staff (integración · Fase 9 · ADR-008 EN6 a EN12)', () => {
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
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await vaciarTablas(prisma);
    await prisma.usuario.createMany({
      data: [
        { id_usuario: STAFF.id, nombre: 'Staff I-43', correo: STAFF.correo, rol: RolUsuario.STAFF },
        { id_usuario: DUENO.id, nombre: 'Dueño I-43', correo: DUENO.correo, rol: RolUsuario.SOLICITANTE },
      ],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Un PODCAST entregado CON enlace (cumple la Fase 8) y su camino de transiciones. */
  const sembrarEntrega = async (estado = 'Entregado', enlace_entrega: string | null = A) => {
    await prisma.solicitud.create({
      data: {
        radicado: RADICADO,
        id_usuario: DUENO.id,
        categoria: CategoriaSolicitud.PODCAST,
        proposito: 'Pódcast entregado (I-43)',
        fecha_inicio: new Date('2026-10-28T09:00:00-05:00'),
        fecha_fin: new Date('2026-10-28T10:00:00-05:00'),
        estado,
        sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
        enlace_entrega,
      },
    });
    if (estado !== 'Entregado') return;
    const camino = [
      ['Recibido', 'Validado', '2026-10-20T09:00:00-05:00'],
      ['Validado', 'En Producción', '2026-10-28T09:00:00-05:00'],
      ['En Producción', 'Edición y postproducción', '2026-10-28T11:00:00-05:00'],
      ['Edición y postproducción', 'Entregado', '2026-11-04T16:00:00-05:00'],
    ] as const;
    await prisma.log_Auditoria.createMany({
      data: camino.map(([estado_anterior, estado_nuevo, fecha]) => ({
        radicado_solicitud: RADICADO,
        estado_anterior,
        estado_nuevo,
        modificado_por: STAFF.id,
        fecha_modificacion: new Date(fecha),
      })),
    });
  };
  const fila = () =>
    prisma.solicitud.findUniqueOrThrow({ where: { radicado: RADICADO }, select: { estado: true, enlace_entrega: true } });
  const eventosDeEntrega = () =>
    prisma.log_Auditoria.findMany({
      where: { radicado_solicitud: RADICADO, enlace_campo: CampoEnlace.ENTREGA },
      select: { estado_anterior: true, estado_nuevo: true, modificado_por: true, enlace_anterior: true, enlace_nuevo: true, motivo_correccion: true },
    });
  const transiciones = () => prisma.log_Auditoria.count({ where: { radicado_solicitud: RADICADO, enlace_campo: null } });
  const evento = (enlace_anterior: string, enlace_nuevo: string, motivo_correccion: string | null) => ({
    estado_anterior: 'Entregado',
    estado_nuevo: 'Entregado',
    modificado_por: STAFF.id,
    enlace_anterior,
    enlace_nuevo,
    motivo_correccion,
  });
  const corregir = (anterior: string, nuevo: string, motivo?: string, quien: UsuarioAutenticado = STAFF) =>
    service.corregirEnlaceEntrega(RADICADO, quien, {
      enlace_entrega_anterior: anterior,
      enlace_entrega: nuevo,
      ...(motivo === undefined ? {} : { motivo_correccion: motivo }),
    });
  const capturar = async (operacion: Promise<unknown>): Promise<unknown> => {
    try {
      await operacion;
    } catch (error: unknown) {
      return error;
    }
    throw new Error('Se esperaba un rechazo');
  };

  it('I-43a · corrige el enlace: estado intacto, un evento ENTREGA, ninguna transición; historial sí, línea de vida no', async () => {
    await sembrarEntrega();
    const staffAntes = await service.findOne(RADICADO, STAFF);
    const duenoAntes = await service.findOne(RADICADO, DUENO);

    const respuesta = await corregir(A, B, MOTIVO);

    expect(respuesta).toMatchObject({ sin_cambios: false, solicitud: { estado: 'Entregado', enlace_entrega: B } });
    expect(await fila()).toEqual({ estado: 'Entregado', enlace_entrega: B });
    expect(await eventosDeEntrega()).toEqual([evento(A, B, MOTIVO)]);
    expect(await transiciones()).toBe(4);
    expect((await service.historialDeEnlaces(RADICADO, STAFF)).eventos).toEqual([
      expect.objectContaining({ enlace_campo: CampoEnlace.ENTREGA, enlace_anterior: A, enlace_nuevo: B, motivo_correccion: MOTIVO }),
    ]);
    expect((await service.findOne(RADICADO, STAFF)).logs).toEqual(staffAntes.logs);
    const duenoDespues = await service.findOne(RADICADO, DUENO);
    expect(duenoDespues.logs).toEqual(duenoAntes.logs);
    expect(duenoDespues.enlace_entrega).toBe(B);
    expect(JSON.stringify(duenoDespues)).not.toContain(A);
  });

  it('I-43b · sin motivo → el evento queda con motivo_correccion NULL', async () => {
    await sembrarEntrega();

    await corregir(A, B);

    expect(await eventosDeEntrega()).toEqual([evento(A, B, null)]);
  });

  it.each([
    ['10 caracteres reales con un emoji (11 unidades UTF-16)', `${'a'.repeat(9)}🎬`],
    ['500 caracteres reales', 'b'.repeat(500)],
  ])('I-43c · B9 acepta en el motor un motivo de %s', async (_caso, motivo) => {
    await sembrarEntrega();

    await corregir(A, B, motivo);

    expect(await eventosDeEntrega()).toEqual([evento(A, B, motivo)]);
  });

  it('I-43d · el enlace pedido ya es el vigente, con el anterior desactualizado → sin_cambios, sin evento ni motivo', async () => {
    await sembrarEntrega();

    expect(await corregir(C, A, MOTIVO)).toMatchObject({ sin_cambios: true, solicitud: { enlace_entrega: A } });
    expect(await eventosDeEntrega()).toEqual([]);
  });

  it('I-43e · fuera de «Entregado» → 409, sin evento', async () => {
    await sembrarEntrega('Validado', null);

    const error = await capturar(corregir(A, B, MOTIVO));

    expect((error as ConflictException).message).toBe(MENSAJE_CORRECCION_SOLO_EN_ENTREGADO);
    expect(await eventosDeEntrega()).toEqual([]);
  });

  it('I-43f · un SOLICITANTE (el dueño) → 403, sin evento ni cambio', async () => {
    await sembrarEntrega();

    expect(await capturar(corregir(A, B, MOTIVO, DUENO))).toBeInstanceOf(ForbiddenException);
    expect(await fila()).toEqual({ estado: 'Entregado', enlace_entrega: A });
    expect(await eventosDeEntrega()).toEqual([]);
  });

  it('I-43g · el enlace cambia entre la validación y la escritura → 409, sin evento, y queda el valor del otro', async () => {
    await sembrarEntrega();
    const puntos = service as unknown as PuntosDePrueba;
    const escrituraReal = puntos.escribirConCompareAndSet.bind(service);
    jest.spyOn(puntos, 'escribirConCompareAndSet').mockImplementationOnce(async (op) => {
      await prisma.solicitud.update({ where: { radicado: RADICADO }, data: { enlace_entrega: C } });
      return escrituraReal(op);
    });

    const error = await capturar(corregir(A, B, MOTIVO));

    expect((error as ConflictException).message).toBe(MENSAJE_CAMBIO_CONCURRENTE);
    expect(await fila()).toEqual({ estado: 'Entregado', enlace_entrega: C });
    expect(await eventosDeEntrega()).toEqual([]);
  });

  it('I-43h · BARRERA: dos correcciones a la vez → gana una, un solo evento, y la fila es la de la ganadora', async () => {
    await sembrarEntrega();
    const puntos = service as unknown as PuntosDePrueba;
    const escrituraReal = puntos.escribirConCompareAndSet.bind(service);
    const llegar = crearBarrera(2);
    const escrituras = jest.spyOn(puntos, 'escribirConCompareAndSet').mockImplementation(async (op) => {
      await llegar();
      return escrituraReal(op);
    });

    const resultados = await Promise.allSettled([corregir(A, B, MOTIVO), corregir(A, C, MOTIVO)]);

    expect(escrituras).toHaveBeenCalledTimes(2);
    const ganadora = resultados.findIndex((r) => r.status === 'fulfilled');
    const rechazos = resultados.flatMap((r): unknown[] => (r.status === 'rejected' ? [r.reason] : []));
    expect(rechazos).toHaveLength(1);
    expect(rechazos[0]).toBeInstanceOf(ConflictException);
    expect((rechazos[0] as ConflictException).message).toBe(MENSAJE_CAMBIO_CONCURRENTE);
    const enlaceGanador = ganadora === 0 ? B : C;
    expect(await fila()).toEqual({ estado: 'Entregado', enlace_entrega: enlaceGanador });
    expect(await eventosDeEntrega()).toEqual([evento(A, enlaceGanador, MOTIVO)]);
    expect(await transiciones()).toBe(4);
  });
});
