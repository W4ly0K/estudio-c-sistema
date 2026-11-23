import { ConflictException } from '@nestjs/common';
import { CategoriaSolicitud, PrismaClient, RolUsuario, SubEspacio } from '@prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';
import {
  MENSAJE_ANEXO_CAMBIO_EN_REVISION,
  MENSAJE_CAMBIO_CONCURRENTE,
  SolicitudesService,
} from '../../src/solicitudes/solicitudes.service';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 9 · ADR-005 E7 (lote J1) · I-44 contra PostgreSQL REAL: aprobar (T1) un PODCAST con anexo.
 *  - I-44a: con el anexo vigente como anexo_revisado → Validado, con su log de T1 (una transición).
 *  - I-44b: con otro anexo → 409 CAMBIO_EN_REVISION, sin escribir.
 *  - I-44c: el anexo cambia ENTRE la validación y la escritura → el compare-and-set (que ahora exige
 *    enlace_anexo) pierde: 409 CAMBIO_CONCURRENTE, sin log, y la solicitud queda como la dejó el otro.
 * Todavía no hay endpoint para editar el anexo (lote J2): el cambio concurrente se hace directo en la base.
 * Datos sintéticos de integración: nunca se tocan registros de producción.
 */
const STAFF = 'uuid-staff-i44';
const SOLICITANTE = 'uuid-solicitante-i44';
const RADICADO = 'EC-I44-PODCAST';
const ANEXO = 'https://drive.google.com/file/d/i44-guion/view';
const ANEXO_NUEVO = 'https://drive.google.com/file/d/i44-guion-v2/view';
const AHORA = new Date('2026-10-05T10:00:00-05:00');

/** Lo que la prueba necesita del servicio para intercalar el cambio concurrente. */
interface PuntosDePrueba {
  escribirConCompareAndSet: (op: unknown) => Promise<unknown>;
}

describe('I-44 · aprobación de un PODCAST con anexo (integración · Fase 9 · ADR-005 E7)', () => {
  let prisma: PrismaClient;
  let service: SolicitudesService;

  beforeAll(() => {
    prisma = crearPrismaDeIntegracion();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    service = new SolicitudesService(prisma as unknown as PrismaService, new RelojFijo(AHORA));
    await vaciarTablas(prisma);
    await prisma.usuario.createMany({
      data: [
        { id_usuario: STAFF, nombre: 'Staff I-44', correo: 'staff-i44@prueba.local', rol: RolUsuario.STAFF },
        { id_usuario: SOLICITANTE, nombre: 'Solicitante I-44', correo: 'solicitante-i44@prueba.local', rol: RolUsuario.SOLICITANTE },
      ],
    });
    await prisma.solicitud.create({
      data: {
        radicado: RADICADO,
        id_usuario: SOLICITANTE,
        categoria: CategoriaSolicitud.PODCAST,
        proposito: 'Pódcast con guion (I-44)',
        fecha_inicio: new Date('2026-10-27T09:00:00-05:00'),
        fecha_fin: new Date('2026-10-27T10:00:00-05:00'),
        estado: 'Recibido',
        sub_espacio: SubEspacio.ESTUDIO_COMPLETO,
        enlace_anexo: ANEXO,
      },
    });
  });

  const estadoYAnexo = () =>
    prisma.solicitud.findUnique({ where: { radicado: RADICADO }, select: { estado: true, enlace_anexo: true } });
  const logs = () => prisma.log_Auditoria.findMany({ where: { radicado_solicitud: RADICADO } });
  const capturar = async (operacion: Promise<unknown>): Promise<unknown> => {
    try {
      await operacion;
    } catch (error: unknown) {
      return error;
    }
    throw new Error('Se esperaba un rechazo');
  };

  it('I-44a · con el anexo vigente → Validado, con un solo log de T1 (sin columnas de enlace)', async () => {
    await service.update(RADICADO, { estado: 'Validado', anexo_revisado: ANEXO }, STAFF);

    expect(await estadoYAnexo()).toEqual({ estado: 'Validado', enlace_anexo: ANEXO });
    expect(await logs()).toEqual([
      expect.objectContaining({
        estado_anterior: 'Recibido',
        estado_nuevo: 'Validado',
        modificado_por: STAFF,
        enlace_campo: null,
        enlace_anterior: null,
        enlace_nuevo: null,
      }),
    ]);
  });

  it('I-44b · con otro anexo → 409 CAMBIO_EN_REVISION, sin escribir', async () => {
    const error = await capturar(service.update(RADICADO, { estado: 'Validado', anexo_revisado: ANEXO_NUEVO }, STAFF));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(MENSAJE_ANEXO_CAMBIO_EN_REVISION);
    expect(await estadoYAnexo()).toEqual({ estado: 'Recibido', enlace_anexo: ANEXO });
    expect(await logs()).toEqual([]);
  });

  it('I-44c · el anexo cambia entre la validación y la escritura → 409 CAMBIO_CONCURRENTE, sin log', async () => {
    const puntos = service as unknown as PuntosDePrueba;
    const escrituraReal = puntos.escribirConCompareAndSet.bind(service);
    jest.spyOn(puntos, 'escribirConCompareAndSet').mockImplementationOnce(async (op) => {
      // El solicitante cambia el anexo después de que el servicio comparó anexo_revisado.
      await prisma.solicitud.update({ where: { radicado: RADICADO }, data: { enlace_anexo: ANEXO_NUEVO } });
      return escrituraReal(op);
    });

    const error = await capturar(service.update(RADICADO, { estado: 'Validado', anexo_revisado: ANEXO }, STAFF));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(MENSAJE_CAMBIO_CONCURRENTE);
    expect(await estadoYAnexo()).toEqual({ estado: 'Recibido', enlace_anexo: ANEXO_NUEVO });
    expect(await logs()).toEqual([]);
  });
});
