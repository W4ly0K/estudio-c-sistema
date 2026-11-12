import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { CampoEnlace, CategoriaSolicitud, PrismaClient, RolUsuario, SubEspacio } from '@prisma/client';
import type { UsuarioAutenticado } from '../../src/auth/interfaces/usuario-autenticado.interface';
import type { PrismaService } from '../../src/prisma/prisma.service';
import {
  MENSAJE_ANEXO_CAMBIO_EN_REVISION,
  MENSAJE_ANEXO_SOLO_EN_RECIBIDO,
  MENSAJE_CAMBIO_CONCURRENTE,
  SolicitudesService,
} from '../../src/solicitudes/solicitudes.service';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 9 · ADR-009 AN10 a AN14 y ADR-012 (lote J2) · I-42 contra PostgreSQL REAL.
 *  - I-42a: AUDITORÍA. Agregar, cambiar y retirar: la fila y UN evento ENLACE_ANEXO por cambio, y el
 *    detalle (línea de vida) de los dos roles no los muestra.
 *  - I-42b: AUTORIZACIÓN. Otra cuenta → 404, sin evento.
 *  - I-42c y I-42d: sin_cambios (también con el anterior desactualizado) y fuera de «Recibido» (409).
 *  - I-42e a I-42i: CONCURRENCIA. Compare-and-set perdido, dos ediciones a la vez, edición frente a T1
 *    (en los dos órdenes y en paralelo) y edición frente a la cancelación. La BARRERA obliga a que las dos
 *    peticiones validen sobre la misma versión de la fila antes de que ninguna escriba.
 * Datos sintéticos de integración: nunca se tocan registros de producción.
 */
const AHORA = new Date('2026-10-05T10:00:00-05:00');
const STAFF = 'uuid-staff-i42';
const DUENO: UsuarioAutenticado = { id: 'uuid-solicitante-i42', correo: 'solicitante-i42@prueba.local', rol: RolUsuario.SOLICITANTE };
const OTRO: UsuarioAutenticado = { id: 'uuid-otro-i42', correo: 'otro-i42@prueba.local', rol: RolUsuario.SOLICITANTE };
const RADICADO = 'EC-I42-PODCAST';
const A = 'https://drive.google.com/file/d/i42-a/view';
const B = 'https://drive.google.com/file/d/i42-b/view';
const C = 'https://drive.google.com/file/d/i42-c/view';

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

describe('I-42 · edición del anexo por el dueño (integración · Fase 9 · ADR-009 AN10 a AN14)', () => {
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
        { id_usuario: STAFF, nombre: 'Staff I-42', correo: 'staff-i42@prueba.local', rol: RolUsuario.STAFF },
        { id_usuario: DUENO.id, nombre: 'Dueño I-42', correo: DUENO.correo, rol: RolUsuario.SOLICITANTE },
        { id_usuario: OTRO.id, nombre: 'Otro I-42', correo: OTRO.correo, rol: RolUsuario.SOLICITANTE },
      ],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const sembrar = (enlace_anexo: string | null, estado = 'Recibido') =>
    prisma.solicitud.create({
      data: {
        radicado: RADICADO,
        id_usuario: DUENO.id,
        categoria: CategoriaSolicitud.PODCAST,
        proposito: 'Pódcast con guion (I-42)',
        fecha_inicio: new Date('2026-10-27T09:00:00-05:00'),
        fecha_fin: new Date('2026-10-27T10:00:00-05:00'),
        estado,
        sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
        enlace_anexo,
      },
    });
  const fila = () =>
    prisma.solicitud.findUniqueOrThrow({ where: { radicado: RADICADO }, select: { estado: true, enlace_anexo: true } });
  const eventosDeAnexo = () =>
    prisma.log_Auditoria.findMany({
      where: { radicado_solicitud: RADICADO, enlace_campo: CampoEnlace.ANEXO },
      orderBy: { fecha_modificacion: 'asc' },
      select: { estado_anterior: true, estado_nuevo: true, modificado_por: true, enlace_anterior: true, enlace_nuevo: true },
    });
  const transiciones = () => prisma.log_Auditoria.findMany({ where: { radicado_solicitud: RADICADO, enlace_campo: null } });
  const editar = (anterior: string | null, nuevo: string | null, quien: UsuarioAutenticado = DUENO) =>
    service.editarAnexo(RADICADO, quien, { enlace_anexo_anterior: anterior, enlace_anexo: nuevo });
  const evento = (enlace_anterior: string | null, enlace_nuevo: string | null) => ({
    estado_anterior: 'Recibido',
    estado_nuevo: 'Recibido',
    modificado_por: DUENO.id,
    enlace_anterior,
    enlace_nuevo,
  });
  const capturar = async (operacion: Promise<unknown>): Promise<unknown> => {
    try {
      await operacion;
    } catch (error: unknown) {
      return error;
    }
    throw new Error('Se esperaba un rechazo');
  };
  /** Las dos escrituras esperan a que ambas peticiones hayan validado (el peor orden, siempre). */
  const instalarBarrera = (): jest.SpyInstance => {
    const puntos = service as unknown as PuntosDePrueba;
    const escrituraReal = puntos.escribirConCompareAndSet.bind(service);
    const llegar = crearBarrera(2);
    return jest.spyOn(puntos, 'escribirConCompareAndSet').mockImplementation(async (op) => {
      await llegar();
      return escrituraReal(op);
    });
  };
  /** Exactamente una gana; la otra pierde el compare-and-set con el 409 de siempre. */
  const unaGana = (resultados: PromiseSettledResult<unknown>[]): number => {
    const ganadora = resultados.findIndex((r) => r.status === 'fulfilled');
    const rechazos = resultados.flatMap((r): unknown[] => (r.status === 'rejected' ? [r.reason] : []));
    expect(rechazos).toHaveLength(1);
    expect(rechazos[0]).toBeInstanceOf(ConflictException);
    expect((rechazos[0] as ConflictException).message).toBe(MENSAJE_CAMBIO_CONCURRENTE);
    expect(ganadora).toBeGreaterThanOrEqual(0);
    return ganadora;
  };

  it('I-42a · agregar, cambiar y retirar: la fila, un evento por cambio y ninguno en la línea de vida', async () => {
    await sembrar(null);

    expect(await editar(null, A)).toMatchObject({ sin_cambios: false });
    expect(await editar(A, B)).toMatchObject({ sin_cambios: false });
    const retiro = await editar(B, null);

    expect(retiro).toMatchObject({ sin_cambios: false, solicitud: { enlace_anexo: null, logs: [] } });
    expect(await fila()).toEqual({ estado: 'Recibido', enlace_anexo: null });
    expect(await eventosDeAnexo()).toEqual([evento(null, A), evento(A, B), evento(B, null)]);
    expect((await service.findOne(RADICADO, DUENO)).logs).toEqual([]);
    expect((await service.findOne(RADICADO, { id: STAFF, correo: 'staff-i42@prueba.local', rol: RolUsuario.STAFF })).logs).toEqual([]);
  });

  it('I-42b · otra cuenta → 404, sin evento ni cambio', async () => {
    await sembrar(A);

    expect(await capturar(editar(A, B, OTRO))).toBeInstanceOf(NotFoundException);
    expect(await fila()).toEqual({ estado: 'Recibido', enlace_anexo: A });
    expect(await eventosDeAnexo()).toEqual([]);
  });

  it('I-42c · el valor pedido ya es el vigente, con el anterior observado desactualizado → sin_cambios, sin evento', async () => {
    await sembrar(A);

    expect(await editar(B, A)).toMatchObject({ sin_cambios: true, solicitud: { enlace_anexo: A } });
    expect(await eventosDeAnexo()).toEqual([]);
  });

  it('I-42d · fuera de «Recibido», incluso con el mismo valor → 409, sin evento', async () => {
    await sembrar(A, 'Validado');

    const error = await capturar(editar(A, A));

    expect((error as ConflictException).message).toBe(MENSAJE_ANEXO_SOLO_EN_RECIBIDO);
    expect(await eventosDeAnexo()).toEqual([]);
  });

  it('I-42e · el anexo cambia entre la validación y la escritura → 409, sin evento, y queda el valor del otro', async () => {
    await sembrar(A);
    const puntos = service as unknown as PuntosDePrueba;
    const escrituraReal = puntos.escribirConCompareAndSet.bind(service);
    jest.spyOn(puntos, 'escribirConCompareAndSet').mockImplementationOnce(async (op) => {
      await prisma.solicitud.update({ where: { radicado: RADICADO }, data: { enlace_anexo: C } });
      return escrituraReal(op);
    });

    const error = await capturar(editar(A, B));

    expect((error as ConflictException).message).toBe(MENSAJE_CAMBIO_CONCURRENTE);
    expect(await fila()).toEqual({ estado: 'Recibido', enlace_anexo: C });
    expect(await eventosDeAnexo()).toEqual([]);
  });

  it('I-42f · BARRERA: dos ediciones a la vez → gana una, un solo evento, y la fila es la de la ganadora', async () => {
    await sembrar(A);
    const escrituras = instalarBarrera();

    const resultados = await Promise.allSettled([editar(A, B), editar(A, C)]);

    expect(escrituras).toHaveBeenCalledTimes(2);
    const ganadora = unaGana(resultados) === 0 ? B : C;
    expect(await fila()).toEqual({ estado: 'Recibido', enlace_anexo: ganadora });
    expect(await eventosDeAnexo()).toEqual([evento(A, ganadora)]);
  });

  it('I-42g · edición y después T1 con el anexo viejo → 409 de E7; T1 y después edición → 409 de estado', async () => {
    await sembrar(A);
    await editar(A, B);
    const aprobacionVieja = await capturar(service.update(RADICADO, { estado: 'Validado', anexo_revisado: A }, STAFF));
    expect((aprobacionVieja as ConflictException).message).toBe(MENSAJE_ANEXO_CAMBIO_EN_REVISION);
    expect(await fila()).toEqual({ estado: 'Recibido', enlace_anexo: B });

    await service.update(RADICADO, { estado: 'Validado', anexo_revisado: B }, STAFF);
    const edicionTardia = await capturar(editar(B, C));
    expect((edicionTardia as ConflictException).message).toBe(MENSAJE_ANEXO_SOLO_EN_RECIBIDO);
    expect(await fila()).toEqual({ estado: 'Validado', enlace_anexo: B });
    expect(await eventosDeAnexo()).toEqual([evento(A, B)]);
    expect(await transiciones()).toHaveLength(1);
  });

  it('I-42h · BARRERA: T1 y edición en paralelo → gana una y el resultado es coherente', async () => {
    await sembrar(A);
    const escrituras = instalarBarrera();

    const resultados = await Promise.allSettled([
      service.update(RADICADO, { estado: 'Validado', anexo_revisado: A }, STAFF),
      editar(A, B),
    ]);

    expect(escrituras).toHaveBeenCalledTimes(2);
    if (unaGana(resultados) === 0) {
      expect(await fila()).toEqual({ estado: 'Validado', enlace_anexo: A });
      expect(await transiciones()).toHaveLength(1);
      expect(await eventosDeAnexo()).toEqual([]);
    } else {
      expect(await fila()).toEqual({ estado: 'Recibido', enlace_anexo: B });
      expect(await transiciones()).toHaveLength(0);
      expect(await eventosDeAnexo()).toEqual([evento(A, B)]);
    }
  });

  it('I-42i · BARRERA: cancelación y edición en paralelo → nunca una actualización perdida ni un evento sin cambio', async () => {
    // La cancelación no depende del anexo (su compare-and-set exige dueño y estado). Si la edición escribe
    // primero, la cancelación también procede: es correcto. Si la cancelación escribe primero, la edición
    // pierde (ya no está en «Recibido»). En cualquier orden: cancelada, y un evento ANEXO solo si el
    // anexo de verdad cambió.
    await sembrar(A);
    const escrituras = instalarBarrera();

    const [cancelacion, edicion] = await Promise.allSettled([service.cancelar(RADICADO, DUENO), editar(A, B)]);

    expect(escrituras).toHaveBeenCalledTimes(2);
    expect(cancelacion?.status).toBe('fulfilled');
    expect(await transiciones()).toHaveLength(1);
    // El resultado de la edición tiene que existir antes de leer su estado o su motivo.
    expect(edicion).toBeDefined();
    if (edicion === undefined) throw new Error('Promise.allSettled no devolvió el resultado de la edición');
    if (edicion.status === 'fulfilled') {
      expect(await fila()).toEqual({ estado: 'Cancelado por el Usuario', enlace_anexo: B });
      expect(await eventosDeAnexo()).toEqual([evento(A, B)]);
    } else {
      expect(edicion.status).toBe('rejected');
      const motivo: unknown = edicion.reason;
      expect(motivo).toBeInstanceOf(ConflictException);
      if (!(motivo instanceof ConflictException)) throw new Error('La edición debía perder con ConflictException');
      expect(motivo.message).toBe(MENSAJE_CAMBIO_CONCURRENTE);
      expect(await fila()).toEqual({ estado: 'Cancelado por el Usuario', enlace_anexo: A });
      expect(await eventosDeAnexo()).toEqual([]);
    }
  });
});
