import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CategoriaSolicitud, Log_Auditoria, Solicitud } from '@prisma/client';
import {
  MENSAJE_FECHAS_SOLO_EN_RECIBIDO,
  MENSAJE_CAMBIO_CONCURRENTE,
  MENSAJE_CANCELAR_CON_PROPUESTA,
  MENSAJE_CANCELAR_EN_PRODUCCION,
  MENSAJE_FRANJA_VENCIDA,
  MENSAJE_MOTIVO_SOLO_EN_RECHAZO,
  MENSAJE_PROPUESTA_SIN_CAMBIOS,
  MENSAJE_PROPUESTA_YA_PENDIENTE,
  MENSAJE_REPROGRAMACION_PROPUESTA,
  MENSAJE_REPROGRAMAR_EN_RECIBIDO,
  MENSAJE_SOLICITUD_CANCELADA,
  MENSAJE_SOLICITUD_NO_ENCONTRADA,
  MENSAJE_USAR_REPROGRAMACION,
  MENSAJES_TRANSICION_INVALIDA,
  SolicitudesService,
} from './solicitudes.service';
import {
  DetalleSolicitudSolicitante,
  SELECT_DETALLE_SOLICITANTE,
  SELECT_DETALLE_STAFF,
} from './proyecciones/detalle-solicitud.proyeccion';
import { USUARIO_SOLICITANTE, USUARIO_STAFF } from '../../test/utils/contexto-http.mock';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';
import type { ProponerReprogramacionDto } from './dto/proponer-reprogramacion.dto';
import { type ErrorHorario, MENSAJES_ERROR_HORARIO } from './reglas/horario.validator';
import { RelojFijo } from '../../test/utils/reloj-fijo';
import { MENSAJE_CA06 } from './errores/traslape-ca06';
import {
  errorDesconocidoDePrisma,
  MENSAJE_23514_CHECK,
  MENSAJE_23P01_CREATE,
  MENSAJE_23P01_TX_INTERACTIVA,
} from '../../test/utils/errores-postgres.fixture';

/** "Ahora" fijo: lunes 5 de octubre de 2026, 10:00 en Bogotá. Mínima sin urgencia: miércoles 14. */
const AHORA = new Date('2026-10-05T10:00:00-05:00');

const solicitudBase: Solicitud = {
  radicado: 'EC-2099-0001',
  id_usuario: 'uuid-solicitante',
  categoria: CategoriaSolicitud.ESPACIOS,
  proposito: 'Grabación de clase magistral',
  num_participantes: null,
  // Fase 3: instantes con zona horaria explícita (jueves 15 de enero de 2099, 9:00–10:00 en Bogotá)
  fecha_inicio: new Date('2099-01-15T09:00:00-05:00'),
  fecha_fin: new Date('2099-01-15T10:00:00-05:00'),
  fecha_propuesta_inicio: null,
  fecha_propuesta_fin: null,
  estado: 'Recibido',
  es_urgencia: false,
};

// Test de COMPILACIÓN (Decisión I): si alguien agrega modificado_por a la proyección del
// solicitante, esta línea deja de ser un error de tipos → @ts-expect-error queda sin usar → tsc falla.
// @ts-expect-error — el solicitante no debe recibir la identidad del Staff
type _SinAutorStaff = DetalleSolicitudSolicitante['logs'][number]['modificado_por'];

const logBase: Log_Auditoria = {
  id_log: 'uuid-log',
  radicado_solicitud: 'EC-2099-0001',
  estado_anterior: 'Recibido',
  estado_nuevo: 'Rechazado',
  modificado_por: 'uuid-staff',
  fecha_modificacion: new Date(),
  motivo_rechazo: 'Equipo en mantenimiento preventivo',
};

describe('SolicitudesService', () => {
  const prismaMock = {
    solicitud: {
      findFirst: jest.fn<Promise<Solicitud | null>, [unknown]>(),
      findUnique: jest.fn<Promise<Solicitud | null>, [unknown]>(),
      findMany: jest.fn<Promise<Solicitud[]>, [unknown]>(),
      create: jest.fn<Promise<Solicitud>, [unknown]>(),
      updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
      findUniqueOrThrow: jest.fn<Promise<Solicitud>, [unknown]>(),
      findFirstOrThrow: jest.fn<Promise<unknown>, [unknown]>(),
    },
    solicitud_Recurso: {
      deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
      createMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    },
    log_Auditoria: { create: jest.fn<Promise<Log_Auditoria>, [unknown]>() },
    // F4: transacción interactiva; el callback recibe este mismo mock como `tx`.
    $transaction: jest.fn<Promise<unknown>, [(tx: unknown) => Promise<unknown>]>(),
  };

  let service: SolicitudesService;
  let reloj: RelojFijo;

  beforeEach(() => {
    prismaMock.solicitud.findFirst.mockReset();
    prismaMock.solicitud.findUnique.mockReset();
    prismaMock.solicitud.findMany.mockReset();
    prismaMock.solicitud.create.mockReset();
    prismaMock.solicitud.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prismaMock.solicitud.findUniqueOrThrow.mockReset().mockResolvedValue(solicitudBase);
    prismaMock.solicitud.findFirstOrThrow.mockReset();
    prismaMock.solicitud_Recurso.deleteMany.mockReset().mockResolvedValue({ count: 0 });
    prismaMock.solicitud_Recurso.createMany.mockReset().mockResolvedValue({ count: 0 });
    prismaMock.log_Auditoria.create.mockReset();
    prismaMock.$transaction.mockReset().mockImplementation((operacion) => operacion(prismaMock));
    reloj = new RelojFijo(AHORA);
    service = new SolicitudesService(prismaMock as unknown as PrismaService, reloj);
  });

  it('create() persiste como id_usuario el identificador recibido del token', async () => {
    const dto: CreateSolicitudeDto = {
      categoria: CategoriaSolicitud.ESPACIOS,
      proposito: solicitudBase.proposito,
      fecha_inicio: solicitudBase.fecha_inicio,
      fecha_fin: solicitudBase.fecha_fin,
    };
    prismaMock.solicitud.findFirst.mockResolvedValue(null);
    prismaMock.solicitud.create.mockResolvedValue(solicitudBase);

    await service.create(dto, 'uuid-del-token');

    expect(prismaMock.solicitud.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id_usuario: 'uuid-del-token', estado: 'Recibido' }),
      }),
    );
  });

  describe('create() — reglas de horario integradas (Fase 3)', () => {
    const dtoEntre = (inicio: string, fin: string): CreateSolicitudeDto => ({
      categoria: CategoriaSolicitud.ESPACIOS,
      proposito: solicitudBase.proposito,
      fecha_inicio: new Date(inicio),
      fecha_fin: new Date(fin),
    });

    beforeEach(() => {
      prismaMock.solicitud.findFirst.mockResolvedValue(null);
      prismaMock.solicitud.create.mockResolvedValue(solicitudBase);
    });

    /**
     * Record sobre la unión: si se agrega un código de error y no se le da un
     * caso aquí, tsc falla (la misma idea que la Decisión D-Q).
     */
    const CASO_POR_ERROR: Record<ErrorHorario, readonly [string, string]> = {
      FIN_NO_POSTERIOR: ['2026-10-27T10:00:00-05:00', '2026-10-27T09:00:00-05:00'],
      EN_EL_PASADO: ['2026-10-05T09:00:00-05:00', '2026-10-05T11:00:00-05:00'],
      MULTIPLES_DIAS: ['2026-10-27T17:00:00-05:00', '2026-10-28T09:00:00-05:00'],
      DIA_NO_HABIL: ['2026-10-12T09:00:00-05:00', '2026-10-12T10:00:00-05:00'],
      FUERA_DE_BLOQUE: ['2026-10-27T08:00:00Z', '2026-10-27T10:00:00Z'], // 03:00–05:00 en Bogotá
    };

    it.each(Object.entries(CASO_POR_ERROR) as [ErrorHorario, readonly [string, string]][])(
      '%s → 400 con su mensaje, SIN consultar la BD (CA-04 antes que CA-06)',
      async (codigo, [inicio, fin]) => {
        const intento = service.create(dtoEntre(inicio, fin), 'uuid-del-token');

        await expect(intento).rejects.toBeInstanceOf(BadRequestException);
        await expect(intento).rejects.toThrow(MENSAJES_ERROR_HORARIO[codigo]);
        expect(prismaMock.solicitud.findFirst).not.toHaveBeenCalled();
        expect(prismaMock.solicitud.create).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['martes 13: último día urgente', '2026-10-13', true],
      ['miércoles 14: fecha mínima sin urgencia', '2026-10-14', false],
    ])('es_urgencia según el Reloj inyectado: %s → %s', async (_caso, dia, urgente) => {
      await service.create(
        dtoEntre(`${dia}T14:00:00-05:00`, `${dia}T15:00:00-05:00`),
        'uuid-del-token',
      );

      expect(prismaMock.solicitud.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ es_urgencia: urgente }) }),
      );
    });

    it('consulta el Reloj UNA sola vez por petición (D-U)', async () => {
      const espia = jest.spyOn(reloj, 'ahora');

      await service.create(
        dtoEntre('2026-10-27T09:00:00-05:00', '2026-10-27T10:00:00-05:00'),
        'uuid-del-token',
      );

      expect(espia).toHaveBeenCalledTimes(1);
    });

    it('el año del radicado es el de Bogotá: 31/12 a las 20:00 ya es 2027 en UTC', async () => {
      reloj.fijar(new Date('2026-12-31T20:00:00-05:00'));

      await service.create(
        dtoEntre('2027-01-12T09:00:00-05:00', '2027-01-12T10:00:00-05:00'),
        'uuid-del-token',
      );

      expect(prismaMock.solicitud.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ radicado: expect.stringMatching(/^EC-2026-\d{4}$/) }),
        }),
      );
    });
  });

  describe('create() — CA-06 sin condición de carrera (Fase 4)', () => {
    const dtoValido: CreateSolicitudeDto = {
      categoria: CategoriaSolicitud.ESPACIOS,
      proposito: solicitudBase.proposito,
      fecha_inicio: new Date('2026-10-27T09:00:00-05:00'),
      fecha_fin: new Date('2026-10-27T10:00:00-05:00'),
    };
    let avisos: jest.SpyInstance;

    beforeEach(() => {
      prismaMock.solicitud.findFirst.mockResolvedValue(null);
      avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      avisos.mockRestore();
    });

    /** Ejecuta create() y devuelve lo que rechazó; si se resolviera, la prueba falla. */
    const rechazo = async (): Promise<unknown> => {
      try {
        await service.create(dtoValido, 'uuid-del-token');
      } catch (error: unknown) {
        return error;
      }
      throw new Error('create() debía rechazar');
    };

    it('1 · la consulta previa encuentra un cruce → 409 con MENSAJE_CA06 exacto, sin el radicado ajeno', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue(solicitudBase);

      const error = await rechazo();

      expect(error).toBeInstanceOf(ConflictException);
      const conflicto = error as ConflictException;
      expect(conflicto.getStatus()).toBe(409);
      expect(conflicto.message).toBe(MENSAJE_CA06);
      expect(JSON.stringify(conflicto.getResponse())).not.toContain(solicitudBase.radicado);
      expect(prismaMock.solicitud.create).not.toHaveBeenCalled();
    });

    it('2 · la consulta previa solo pide el radicado (minimización)', async () => {
      prismaMock.solicitud.create.mockResolvedValue(solicitudBase);

      await service.create(dtoValido, 'uuid-del-token');

      expect(prismaMock.solicitud.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ select: { radicado: true } }),
      );
    });

    it('3 · el motor rechaza con el 23P01 real (carrera) → el MISMO 409, sin nada del DETAIL', async () => {
      prismaMock.solicitud.create.mockRejectedValue(errorDesconocidoDePrisma(MENSAJE_23P01_CREATE));

      const error = await rechazo();

      expect(error).toBeInstanceOf(ConflictException);
      const conflicto = error as ConflictException;
      expect(conflicto.getStatus()).toBe(409);
      expect(conflicto.message).toBe(MENSAJE_CA06);
      const respuesta = JSON.stringify(conflicto.getResponse());
      for (const fuga of ['23P01', 'Solicitud_sin_traslape', '2026-10-14', 'tsrange']) {
        expect(respuesta).not.toContain(fuga);
      }
    });

    it('4 · registra la carrera una vez, con el radicado propio y sin el mensaje del motor', async () => {
      prismaMock.solicitud.create.mockRejectedValue(errorDesconocidoDePrisma(MENSAJE_23P01_CREATE));

      await rechazo();

      expect(avisos).toHaveBeenCalledTimes(1);
      const [texto] = avisos.mock.calls[0] as [string];
      expect(texto).toMatch(/EC-2026-\d{4}/);
      expect(texto).not.toContain('2026-10-14');
      expect(texto).not.toContain('23P01');
    });

    it.each<[string, () => Error]>([
      ['5 · 23514 real del CHECK de fechas', () => errorDesconocidoDePrisma(MENSAJE_23514_CHECK)],
      ['6 · error genérico (p. ej. sin conexión)', () => new Error("Can't reach database server")],
    ])('%s → se relanza la MISMA instancia (no es un 409)', async (_caso, crearError) => {
      const original = crearError();
      prismaMock.solicitud.create.mockRejectedValue(original);

      expect(await rechazo()).toBe(original);
      expect(avisos).not.toHaveBeenCalled();
    });
  });

  it('findMisSolicitudes() filtra por el identificador del token (aislamiento de datos)', async () => {
    prismaMock.solicitud.findMany.mockResolvedValue([solicitudBase]);

    await service.findMisSolicitudes('uuid-del-token');

    expect(prismaMock.solicitud.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_usuario: 'uuid-del-token' } }),
    );
  });

  describe('update() con cambio de estado (auditoría CA-09)', () => {
    beforeEach(() => {
      prismaMock.solicitud.findUnique.mockResolvedValue(solicitudBase);
      prismaMock.solicitud.findUniqueOrThrow.mockResolvedValue({ ...solicitudBase, estado: 'Rechazado' });
      prismaMock.log_Auditoria.create.mockResolvedValue(logBase);
    });

    it('registra como autor el idStaff verificado, con estados y motivo correctos', async () => {
      const dto: UpdateSolicitudeDto = {
        estado: 'Rechazado',
        motivo_rechazo: 'Equipo en mantenimiento preventivo',
      };

      await service.update('EC-2099-0001', dto, 'uuid-staff');

      expect(prismaMock.log_Auditoria.create).toHaveBeenCalledWith({
        data: {
          radicado_solicitud: 'EC-2099-0001',
          estado_anterior: 'Recibido',
          estado_nuevo: 'Rechazado',
          modificado_por: 'uuid-staff',
          motivo_rechazo: 'Equipo en mantenimiento preventivo',
        },
      });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('defensa en profundidad: ignora un autor inyectado aunque el DTO se haya saltado el pipe', async () => {
      const dtoContaminado = {
        estado: 'Validado',
        modificado_por: 'uuid-atacante',
      } as unknown as UpdateSolicitudeDto;

      await service.update('EC-2099-0001', dtoContaminado, 'uuid-staff');

      expect(prismaMock.log_Auditoria.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ modificado_por: 'uuid-staff' }),
      });
      expect(JSON.stringify(prismaMock.log_Auditoria.create.mock.calls)).not.toContain(
        'uuid-atacante',
      );
    });
  });

  describe('update() — horario y CA-06 (Fase 4.5)', () => {
    const RADICADO = 'EC-2099-0001';
    /** Solicitud guardada: martes 27 de octubre de 2026, 9:00–10:00 en Bogotá. */
    const guardada = (cambios: Partial<Solicitud> = {}): Solicitud => ({
      ...solicitudBase,
      fecha_inicio: new Date('2026-10-27T09:00:00-05:00'),
      fecha_fin: new Date('2026-10-27T10:00:00-05:00'),
      ...cambios,
    });
    let avisos: jest.SpyInstance;

    beforeEach(() => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada());
      prismaMock.solicitud.findFirst.mockResolvedValue(null);
      prismaMock.solicitud.findUniqueOrThrow.mockResolvedValue(guardada());
      prismaMock.log_Auditoria.create.mockResolvedValue(logBase);
      avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      avisos.mockRestore();
    });

    const actualizar = (dto: UpdateSolicitudeDto) => service.update(RADICADO, dto, 'uuid-staff');

    /** Ejecuta update() y devuelve lo que rechazó; si se resolviera, la prueba falla. */
    const rechazo = async (dto: UpdateSolicitudeDto): Promise<unknown> => {
      try {
        await actualizar(dto);
      } catch (error: unknown) {
        return error;
      }
      throw new Error('update() debía rechazar');
    };

    /** El "data" que recibió el compare-and-set (updateMany dentro de la transacción). */
    const dataDelUpdate = (): Record<string, unknown> =>
      (prismaMock.solicitud.updateMany.mock.calls[0][0] as { data: Record<string, unknown> }).data;

    // Pick (tipo de objeto) y no la clase del DTO: se usa con spread (lint: no-misused-spread).
    const franjaDel = (
      dia: string,
      desde: string,
      hasta: string,
    ): Pick<UpdateSolicitudeDto, 'fecha_inicio' | 'fecha_fin'> => ({
      fecha_inicio: new Date(`${dia}T${desde}:00-05:00`),
      fecha_fin: new Date(`${dia}T${hasta}:00-05:00`),
    });

    const sinEscrituras = () => {
      expect(prismaMock.solicitud.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    };

    it('U-1 · solo fecha_inicio que invierte la franja guardada → 400 FIN_NO_POSTERIOR sin tocar la BD', async () => {
      const error = await rechazo({ fecha_inicio: new Date('2026-10-27T11:00:00-05:00') });

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(MENSAJES_ERROR_HORARIO.FIN_NO_POSTERIOR);
      expect(prismaMock.solicitud.findFirst).not.toHaveBeenCalled();
      sinEscrituras();
    });

    /** Record sobre la unión: un código de error nuevo sin caso aquí rompe tsc. */
    const REPROGRAMACION_INVALIDA: Record<ErrorHorario, readonly [string, string]> = {
      FIN_NO_POSTERIOR: ['2026-10-28T10:00:00-05:00', '2026-10-28T09:00:00-05:00'],
      EN_EL_PASADO: ['2026-10-05T08:00:00-05:00', '2026-10-05T09:00:00-05:00'],
      MULTIPLES_DIAS: ['2026-10-28T17:00:00-05:00', '2026-10-29T09:00:00-05:00'],
      DIA_NO_HABIL: ['2026-10-31T09:00:00-05:00', '2026-10-31T10:00:00-05:00'],
      FUERA_DE_BLOQUE: ['2026-10-28T12:30:00-05:00', '2026-10-28T13:30:00-05:00'],
    };

    it.each(Object.entries(REPROGRAMACION_INVALIDA) as [ErrorHorario, readonly [string, string]][])(
      'U-2 · reprogramar con %s → 400 con su mensaje, sin tocar la BD',
      async (codigo, [inicio, fin]) => {
        const error = await rechazo({ fecha_inicio: new Date(inicio), fecha_fin: new Date(fin) });

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toBe(MENSAJES_ERROR_HORARIO[codigo]);
        expect(prismaMock.solicitud.findFirst).not.toHaveBeenCalled();
        sinEscrituras();
      },
    );

    it('U-3 · marcar "Entregado" (T9) una reserva PASADA solo cambia el estado (sin reglas de horario)', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(
        guardada({
          estado: 'En Producción',
          fecha_inicio: new Date('2026-09-01T09:00:00-05:00'),
          fecha_fin: new Date('2026-09-01T10:00:00-05:00'),
        }),
      );

      const resultado = await actualizar({ estado: 'Entregado' });

      expect(resultado.mensaje).toBe('Estado actualizado y auditado correctamente en la bitácora');
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(dataDelUpdate()).toEqual({ estado: 'Entregado' });
    });

    it.each([
      ['martes 13: aún urgente', '2026-10-13', true],
      ['miércoles 14: ya sin urgencia', '2026-10-14', false],
    ])('U-4 · reprogramar al %s (%s) recalcula es_urgencia = %s (Opción A)', async (_caso, dia, urgente) => {
      await actualizar(franjaDel(dia, '14:00', '15:00'));

      expect(dataDelUpdate()).toMatchObject({ es_urgencia: urgente });
    });

    it('U-5 · la consulta previa excluye la propia solicitud y solo pide el radicado', async () => {
      await actualizar(franjaDel('2026-10-28', '09:00', '10:00'));

      expect(prismaMock.solicitud.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { radicado: RADICADO } }),
          select: { radicado: true },
        }),
      );
    });

    it('U-6 · la reprogramación se cruza con otra → 409 MENSAJE_CA06, sin escribir', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue({ ...solicitudBase, radicado: 'EC-2099-0777' });

      const error = await rechazo(franjaDel('2026-10-28', '09:00', '10:00'));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_CA06);
      expect(JSON.stringify((error as ConflictException).getResponse())).not.toContain('EC-2099-0777');
      sinEscrituras();
    });

    it('U-7 · D1: reactivar (Rechazado → Recibido) → 409 ESTADO_FINAL, sin consultar CA-06 ni escribir', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado: 'Rechazado' }));

      const error = await rechazo({ estado: 'Recibido' });

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJES_TRANSICION_INVALIDA.ESTADO_FINAL);
      expect(prismaMock.solicitud.findFirst).not.toHaveBeenCalled();
      sinEscrituras();
    });

    it.each([
      ['Recibido → Validado (sigue ocupando la misma franja)', 'Recibido', 'Validado'],
      ['Recibido → Rechazado (libera la franja)', 'Recibido', 'Rechazado'],
      ['Validado → En Producción (sigue ocupando la misma franja)', 'Validado', 'En Producción'],
    ])('U-8 · %s no consulta CA-06', async (_caso, desde, hacia) => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado: desde }));

      await actualizar({
        estado: hacia,
        ...(hacia === 'Rechazado' ? { motivo_rechazo: 'Motivo suficientemente detallado' } : {}),
      });

      expect(prismaMock.solicitud.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('U-9 · rescate atómico (fechas + Validado): el motor rechaza dentro de la transacción interactiva (23P01 real) → 409 y un aviso', async () => {
      prismaMock.solicitud.updateMany.mockRejectedValue(errorDesconocidoDePrisma(MENSAJE_23P01_TX_INTERACTIVA));

      const error = await rechazo({ estado: 'Validado', ...franjaDel('2026-10-28', '09:00', '10:00') });

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_CA06);
      expect(avisos).toHaveBeenCalledTimes(1);
      const [texto] = avisos.mock.calls[0] as [string];
      expect(texto).toContain(RADICADO);
      expect(texto).not.toContain('23P01');
    });

    it('U-10 · el motor rechaza la reprogramación (23P01 real en updateMany) → el MISMO 409', async () => {
      prismaMock.solicitud.updateMany.mockRejectedValue(errorDesconocidoDePrisma(MENSAJE_23P01_TX_INTERACTIVA));

      const error = await rechazo(franjaDel('2026-10-28', '09:00', '10:00'));

      expect(error).toBeInstanceOf(ConflictException);
      const respuesta = JSON.stringify((error as ConflictException).getResponse());
      expect((error as ConflictException).message).toBe(MENSAJE_CA06);
      for (const fuga of ['23P01', 'Solicitud_sin_traslape', 'tsrange']) {
        expect(respuesta).not.toContain(fuga);
      }
    });

    it('U-11 · un 23514 real se relanza como la MISMA instancia (no es un 409)', async () => {
      const original = errorDesconocidoDePrisma(MENSAJE_23514_CHECK);
      prismaMock.solicitud.updateMany.mockRejectedValue(original);

      expect(await rechazo(franjaDel('2026-10-28', '09:00', '10:00'))).toBe(original);
      expect(avisos).not.toHaveBeenCalled();
    });

    it('U-12 · estado y fechas en la misma petición se aplican JUNTOS (ya no se descartan)', async () => {
      await actualizar({ estado: 'Validado', ...franjaDel('2026-10-28', '09:00', '10:00') });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(dataDelUpdate()).toMatchObject({
        estado: 'Validado',
        fecha_inicio: new Date('2026-10-28T09:00:00-05:00'),
        fecha_fin: new Date('2026-10-28T10:00:00-05:00'),
        es_urgencia: false,
      });
      expect(prismaMock.log_Auditoria.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ estado_nuevo: 'Validado', modificado_por: 'uuid-staff' }),
      });
    });

    it('U-13 · consulta el Reloj UNA sola vez por petición (D-U)', async () => {
      const espia = jest.spyOn(reloj, 'ahora');

      await actualizar(franjaDel('2026-10-28', '09:00', '10:00'));

      expect(espia).toHaveBeenCalledTimes(1);
    });

    it('U-14 · editar solo el propósito no evalúa horario, no consulta CA-06 ni toca es_urgencia', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(
        guardada({
          fecha_inicio: new Date('2026-09-01T09:00:00-05:00'),
          fecha_fin: new Date('2026-09-01T10:00:00-05:00'),
        }),
      );

      const resultado = await actualizar({ proposito: 'Nuevo propósito de la grabación' });

      expect(resultado.mensaje).toBe('Solicitud actualizada correctamente (sin cambio de estado)');
      expect(prismaMock.solicitud.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.log_Auditoria.create).not.toHaveBeenCalled();
      expect(dataDelUpdate()).toEqual({ proposito: 'Nuevo propósito de la grabación' });
    });

    // ── Fase 5.2a · máquina de estados en el tablero del STAFF (E1–E6, D1, D2, D7, H8) ──

    it('U-15 · E1: Validado → Pendiente de Reprogramación desde el tablero → 409 que remite a /reprogramacion', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado: 'Validado' }));

      const error = await rechazo({ estado: 'Pendiente de Reprogramación' });

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_USAR_REPROGRAMACION);
      sinEscrituras();
    });

    it.each([
      ['Recibido', 'Cancelado por el Usuario'],
      ['Validado', 'Cancelado por el Usuario'],
      ['Pendiente de Reprogramación', 'Validado'],
      ['Pendiente de Reprogramación', 'Cancelado por el Usuario'],
    ])('U-16 · E2/PRD §5.5: el STAFF no ejecuta transiciones del solicitante (%s → %s) → 403', async (desde, hacia) => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado: desde }));

      const error = await rechazo({ estado: hacia });

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).message).toBe(MENSAJES_TRANSICION_INVALIDA.ROL_NO_AUTORIZADO);
      sinEscrituras();
    });

    it.each([
      ['Recibido', 'En Producción'],
      ['Recibido', 'Entregado'],
      ['Validado', 'Recibido'],
      ['En Producción', 'Validado'],
    ])('U-17 · E2: transición no definida (%s → %s) → 409', async (desde, hacia) => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado: desde }));

      const error = await rechazo({ estado: hacia });

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJES_TRANSICION_INVALIDA.TRANSICION_NO_DEFINIDA);
      sinEscrituras();
    });

    it.each(['Entregado', 'Rechazado', 'Cancelado por el Usuario'])(
      'U-18 · E2/D1: desde el estado final %s no hay salida → 409 ESTADO_FINAL',
      async (final) => {
        prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado: final }));

        const error = await rechazo({ estado: 'Validado' });

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toBe(MENSAJES_TRANSICION_INVALIDA.ESTADO_FINAL);
        sinEscrituras();
      },
    );

    it('U-19 · E2 fail-closed: un estado GUARDADO fuera de la máquina (dato sucio) → 409 sin tocar la fila', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado: 'Aprobado' }));

      const error = await rechazo({ estado: 'Validado' });

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJES_TRANSICION_INVALIDA.ESTADO_DESCONOCIDO);
      sinEscrituras();
    });

    it('U-20 · E2: pedir el estado actual no es una transición (sin escrituras, sin transacción)', async () => {
      const resultado = await actualizar({ estado: 'Recibido' });

      expect(resultado.mensaje).toBe('Solicitud actualizada correctamente (sin cambio de estado)');
      expect(resultado.solicitud).toEqual(guardada());
      expect(prismaMock.log_Auditoria.create).not.toHaveBeenCalled();
      sinEscrituras();
    });

    it.each(['Validado', 'En Producción', 'Pendiente de Reprogramación'])(
      'U-21 · D2: mover fechas con la solicitud en %s → 409 sin evaluar CA-06 ni escribir',
      async (estado) => {
        prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado }));

        const error = await rechazo(franjaDel('2026-10-28', '09:00', '10:00'));

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toBe(MENSAJE_FECHAS_SOLO_EN_RECIBIDO);
        expect(prismaMock.solicitud.findFirst).not.toHaveBeenCalled();
        sinEscrituras();
      },
    );

    it('U-22 · D7: aprobar una franja vencida → 409 sin escribir', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(
        guardada({
          fecha_inicio: new Date('2026-10-01T09:00:00-05:00'),
          fecha_fin: new Date('2026-10-01T10:00:00-05:00'),
        }),
      );

      const error = await rechazo({ estado: 'Validado' });

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_FRANJA_VENCIDA);
      sinEscrituras();
    });

    it('U-23 · D7 frontera: una franja que comienza EXACTAMENTE ahora ya no se aprueba', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(
        guardada({ fecha_inicio: AHORA, fecha_fin: new Date(AHORA.getTime() + 60 * 60 * 1000) }),
      );

      const error = await rechazo({ estado: 'Validado' });

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_FRANJA_VENCIDA);
    });

    it('U-24 · D2+D7 rescate: franja vencida + fechas nuevas + Validado en un solo PATCH → aprobada y auditada', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(
        guardada({
          fecha_inicio: new Date('2026-10-01T09:00:00-05:00'),
          fecha_fin: new Date('2026-10-01T10:00:00-05:00'),
        }),
      );

      await actualizar({ estado: 'Validado', ...franjaDel('2026-10-28', '09:00', '10:00') });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(dataDelUpdate()).toMatchObject({
        estado: 'Validado',
        fecha_inicio: new Date('2026-10-28T09:00:00-05:00'),
        fecha_fin: new Date('2026-10-28T10:00:00-05:00'),
      });
    });

    it('U-25 · D7 solo aplica a la aprobación: rechazar una franja vencida sigue permitido', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(
        guardada({
          fecha_inicio: new Date('2026-10-01T09:00:00-05:00'),
          fecha_fin: new Date('2026-10-01T10:00:00-05:00'),
        }),
      );

      await actualizar({ estado: 'Rechazado', motivo_rechazo: 'La fecha solicitada ya pasó sin respuesta' });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    const MOTIVOS_HUERFANOS: Array<[string, UpdateSolicitudeDto]> = [
      ['con un destino distinto de Rechazado', { estado: 'Validado', motivo_rechazo: 'Motivo suficientemente detallado' }],
      ['sin cambio de estado', { motivo_rechazo: 'Motivo suficientemente detallado' }],
    ];

    it.each(MOTIVOS_HUERFANOS)('U-26 · E5: motivo_rechazo %s → 400 sin escribir', async (_caso, dto) => {
      const error = await rechazo(dto);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(MENSAJE_MOTIVO_SOLO_EN_RECHAZO);
      sinEscrituras();
    });

    it('U-27 · H8/ADR-002: radicado inexistente → 404 uniforme, sin eco del radicado', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(null);

      const error = await rechazo({ estado: 'Validado' });

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe(MENSAJE_SOLICITUD_NO_ENCONTRADA);
      expect(JSON.stringify((error as NotFoundException).getResponse())).not.toContain(RADICADO);
      sinEscrituras();
    });

    // ── Fase 5.2b · compare-and-set en una sola transacción interactiva (D5 · F1–F4 · R1) ──

    it('U-28 · F1: el CAS exige el estado y la franja GUARDADOS (exactamente lo que se validó)', async () => {
      await actualizar({ estado: 'Validado' });

      expect(prismaMock.solicitud.updateMany).toHaveBeenCalledWith({
        where: {
          radicado: RADICADO,
          estado: 'Recibido',
          fecha_inicio: guardada().fecha_inicio,
          fecha_fin: guardada().fecha_fin,
        },
        data: { estado: 'Validado' },
      });
    });

    it('U-29 · D5/F3: carrera perdida en una transición (0 filas) → 409 propio, sin log ni recursos, con aviso', async () => {
      prismaMock.solicitud.updateMany.mockResolvedValue({ count: 0 });

      const error = await rechazo({ estado: 'Validado', recursos: [{ id_recurso: 7, cantidad: 2 }] });

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_CAMBIO_CONCURRENTE);
      expect(prismaMock.log_Auditoria.create).not.toHaveBeenCalled();
      expect(prismaMock.solicitud_Recurso.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.solicitud_Recurso.createMany).not.toHaveBeenCalled();
      expect(avisos).toHaveBeenCalledTimes(1);
      const [texto] = avisos.mock.calls[0] as [string];
      expect(texto).toContain(RADICADO);
    });

    it('U-30 · F2/R3: una edición SIN cambio de estado también pierde la carrera con 409 (las fechas no se pisan)', async () => {
      prismaMock.solicitud.updateMany.mockResolvedValue({ count: 0 });

      const error = await rechazo(franjaDel('2026-10-28', '09:00', '10:00'));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_CAMBIO_CONCURRENTE);
    });

    it('U-31 · R1: los recursos se reemplazan dentro de la misma transacción, después del CAS', async () => {
      await actualizar({ recursos: [{ id_recurso: 7, cantidad: 2 }] });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.solicitud_Recurso.deleteMany).toHaveBeenCalledWith({ where: { radicado_solicitud: RADICADO } });
      expect(prismaMock.solicitud_Recurso.createMany).toHaveBeenCalledWith({
        data: [{ radicado_solicitud: RADICADO, id_recurso: 7, cantidad_solicitada: 2 }],
      });
      expect(prismaMock.solicitud.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prismaMock.solicitud_Recurso.deleteMany.mock.invocationCallOrder[0],
      );
    });

    it('U-32 · el log va después del CAS ganado y la respuesta es la fila releída dentro de la transacción', async () => {
      const releida = guardada({ estado: 'Validado' });
      prismaMock.solicitud.findUniqueOrThrow.mockResolvedValue(releida);

      const resultado = await actualizar({ estado: 'Validado' });

      expect(prismaMock.solicitud.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prismaMock.log_Auditoria.create.mock.invocationCallOrder[0],
      );
      expect(prismaMock.solicitud.findUniqueOrThrow).toHaveBeenCalledWith({ where: { radicado: RADICADO } });
      expect(resultado.solicitud).toBe(releida);
    });
  });

  describe('cancelar() — T3/T6 del SOLICITANTE (Fase 5.3 · G1–G8)', () => {
    const RADICADO = 'EC-2099-0001';
    const DETALLE = { radicado: RADICADO, estado: 'Cancelado por el Usuario' };
    const PROPIA = { radicado: RADICADO, id_usuario: USUARIO_SOLICITANTE.id };
    let avisos: jest.SpyInstance;

    beforeEach(() => {
      prismaMock.solicitud.findFirst.mockResolvedValue({ ...solicitudBase, estado: 'Recibido' });
      prismaMock.solicitud.findFirstOrThrow.mockResolvedValue(DETALLE);
      prismaMock.log_Auditoria.create.mockResolvedValue(logBase);
      avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      avisos.mockRestore();
    });

    /** Ejecuta cancelar() y devuelve lo que rechazó; si se resolviera, la prueba falla. */
    const rechazo = async (usuario = USUARIO_SOLICITANTE): Promise<unknown> => {
      try {
        await service.cancelar(RADICADO, usuario);
      } catch (error: unknown) {
        return error;
      }
      throw new Error('cancelar() debía rechazar');
    };

    const sinEscrituras = () => {
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.solicitud.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.log_Auditoria.create).not.toHaveBeenCalled();
    };

    it.each(['Recibido', 'Validado'])(
      'C-1 · T3/T6: el dueño cancela desde %s → CAS con su id y el estado leído, log con su id, respuesta mínima',
      async (estado) => {
        prismaMock.solicitud.findFirst.mockResolvedValue({ ...solicitudBase, estado });

        const resultado = await service.cancelar(RADICADO, USUARIO_SOLICITANTE);

        expect(prismaMock.solicitud.updateMany).toHaveBeenCalledWith({
          where: { radicado: RADICADO, id_usuario: USUARIO_SOLICITANTE.id, estado },
          data: { estado: 'Cancelado por el Usuario' },
        });
        expect(prismaMock.log_Auditoria.create).toHaveBeenCalledWith({
          data: {
            radicado_solicitud: RADICADO,
            estado_anterior: estado,
            estado_nuevo: 'Cancelado por el Usuario',
            modificado_por: USUARIO_SOLICITANTE.id,
          },
        });
        expect(resultado).toEqual({ mensaje: MENSAJE_SOLICITUD_CANCELADA, solicitud: DETALLE });
      },
    );

    it('C-2 · G2/G8: lectura con la propiedad DENTRO del WHERE y relectura con la proyección del solicitante', async () => {
      await service.cancelar(RADICADO, USUARIO_SOLICITANTE);

      expect(prismaMock.solicitud.findFirst).toHaveBeenCalledWith({ where: PROPIA, select: { estado: true } });
      expect(prismaMock.solicitud.findFirstOrThrow).toHaveBeenCalledWith({
        where: PROPIA,
        select: SELECT_DETALLE_SOLICITANTE,
      });
    });

    it('C-3 · G2/ADR-002: ajeno o inexistente → 404 uniforme, sin eco del radicado y sin escribir', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue(null);

      const error = await rechazo();

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe(MENSAJE_SOLICITUD_NO_ENCONTRADA);
      expect(JSON.stringify((error as NotFoundException).getResponse())).not.toContain(RADICADO);
      sinEscrituras();
    });

    it('C-4 · G2: un radicado AJENO en producción responde 404, nunca el 409 que revelaría su estado', async () => {
      // La base solo "encuentra" la fila si el WHERE NO lleva el filtro de propiedad.
      prismaMock.solicitud.findFirst.mockImplementation((args) =>
        Promise.resolve(
          (args as { where: { id_usuario?: string } }).where.id_usuario === undefined
            ? { ...solicitudBase, estado: 'En Producción' }
            : null,
        ),
      );

      const error = await rechazo();

      expect(error).toBeInstanceOf(NotFoundException);
      sinEscrituras();
    });

    it.each(['Rechazado', 'Cancelado por el Usuario', 'Entregado'])(
      'C-5 · G6: desde el estado final %s → 409 ESTADO_FINAL (cancelar dos veces no es idempotente en silencio)',
      async (estado) => {
        prismaMock.solicitud.findFirst.mockResolvedValue({ ...solicitudBase, estado });

        const error = await rechazo();

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toBe(MENSAJES_TRANSICION_INVALIDA.ESTADO_FINAL);
        sinEscrituras();
      },
    );

    it('C-6 · G5: en producción → 409 con su mensaje propio', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue({ ...solicitudBase, estado: 'En Producción' });

      const error = await rechazo();

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_CANCELAR_EN_PRODUCCION);
      sinEscrituras();
    });

    it('C-7 · G5: con una propuesta de reprogramación pendiente → 409 que remite a aceptarla o rechazarla', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue({ ...solicitudBase, estado: 'Pendiente de Reprogramación' });

      const error = await rechazo();

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_CANCELAR_CON_PROPUESTA);
      sinEscrituras();
    });

    it('C-8 · fail-closed: estado guardado fuera de la máquina → 409 ESTADO_DESCONOCIDO', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue({ ...solicitudBase, estado: 'Aprobado' });

      const error = await rechazo();

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJES_TRANSICION_INVALIDA.ESTADO_DESCONOCIDO);
      sinEscrituras();
    });

    it('C-9 · defensa en profundidad: el STAFF que llegue al servicio recibe 403 (PRD §5.5)', async () => {
      const error = await rechazo(USUARIO_STAFF);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).message).toBe(MENSAJES_TRANSICION_INVALIDA.ROL_NO_AUTORIZADO);
      sinEscrituras();
    });

    it('C-10 · D5: el Staff cambió la solicitud entre la lectura y la escritura → 409 sin log y con aviso', async () => {
      prismaMock.solicitud.updateMany.mockResolvedValue({ count: 0 });

      const error = await rechazo();

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_CAMBIO_CONCURRENTE);
      expect(prismaMock.log_Auditoria.create).not.toHaveBeenCalled();
      expect(avisos).toHaveBeenCalledTimes(1);
      const [texto] = avisos.mock.calls[0] as [string];
      expect(texto).toContain(RADICADO);
    });
  });

  describe('proponerReprogramacion() — CA-10 · T5 del STAFF (Fase 5.4 · K1–K9)', () => {
    const RADICADO = 'EC-2099-0001';
    /** Franja OFICIAL: martes 27 de octubre de 2026, 9:00–10:00 en Bogotá. */
    const OFICIAL = {
      fecha_inicio: new Date('2026-10-27T09:00:00-05:00'),
      fecha_fin: new Date('2026-10-27T10:00:00-05:00'),
    };
    const guardada = (cambios: Partial<Solicitud> = {}): Solicitud => ({
      ...solicitudBase,
      ...OFICIAL,
      estado: 'Validado',
      ...cambios,
    });
    const franja = (inicio: string, fin: string): ProponerReprogramacionDto => ({
      fecha_inicio: new Date(inicio),
      fecha_fin: new Date(fin),
    });
    /** Propuesta válida: miércoles 28 de octubre de 2026, 9:00–10:00. */
    const PROPUESTA = franja('2026-10-28T09:00:00-05:00', '2026-10-28T10:00:00-05:00');
    const DETALLE = { radicado: RADICADO, estado: 'Pendiente de Reprogramación' };

    beforeEach(() => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada());
      prismaMock.solicitud.findFirst.mockResolvedValue(null);
      prismaMock.solicitud.findUniqueOrThrow.mockResolvedValue(DETALLE as unknown as Solicitud);
      prismaMock.log_Auditoria.create.mockResolvedValue(logBase);
    });

    const proponer = (dto: ProponerReprogramacionDto = PROPUESTA) =>
      service.proponerReprogramacion(RADICADO, dto, 'uuid-staff');

    /** Ejecuta proponerReprogramacion() y devuelve lo que rechazó; si se resolviera, falla. */
    const rechazo = async (dto: ProponerReprogramacionDto = PROPUESTA): Promise<unknown> => {
      try {
        await proponer(dto);
      } catch (error: unknown) {
        return error;
      }
      throw new Error('proponerReprogramacion() debía rechazar');
    };

    const sinEscrituras = () => {
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.solicitud.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.log_Auditoria.create).not.toHaveBeenCalled();
    };

    it('R-1 · K6: Validado → Pendiente con la propuesta; franja oficial y es_urgencia intactas; log del Staff', async () => {
      const resultado = await proponer();

      expect(prismaMock.solicitud.updateMany).toHaveBeenCalledWith({
        where: { radicado: RADICADO, estado: 'Validado', ...OFICIAL },
        data: {
          estado: 'Pendiente de Reprogramación',
          fecha_propuesta_inicio: PROPUESTA.fecha_inicio,
          fecha_propuesta_fin: PROPUESTA.fecha_fin,
        },
      });
      expect(prismaMock.log_Auditoria.create).toHaveBeenCalledWith({
        data: {
          radicado_solicitud: RADICADO,
          estado_anterior: 'Validado',
          estado_nuevo: 'Pendiente de Reprogramación',
          modificado_por: 'uuid-staff',
        },
      });
      expect(prismaMock.solicitud.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { radicado: RADICADO },
        select: SELECT_DETALLE_STAFF,
      });
      expect(resultado).toEqual({ mensaje: MENSAJE_REPROGRAMACION_PROPUESTA, solicitud: DETALLE });
    });

    it('R-2 · H8: radicado inexistente → 404 uniforme sin escribir', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(null);

      const error = await rechazo();

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe(MENSAJE_SOLICITUD_NO_ENCONTRADA);
      sinEscrituras();
    });

    it('R-3 · K3: en Recibido → 409 que remite al PATCH (D2), sin consultar CA-06', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado: 'Recibido' }));

      const error = await rechazo();

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_REPROGRAMAR_EN_RECIBIDO);
      expect(prismaMock.solicitud.findFirst).not.toHaveBeenCalled();
      sinEscrituras();
    });

    it('R-4 · K3: con una propuesta ya pendiente → 409 (la solicitud está congelada)', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado: 'Pendiente de Reprogramación' }));

      const error = await rechazo();

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_PROPUESTA_YA_PENDIENTE);
      sinEscrituras();
    });

    it('R-5 · en producción → 409 TRANSICION_NO_DEFINIDA', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado: 'En Producción' }));

      const error = await rechazo();

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJES_TRANSICION_INVALIDA.TRANSICION_NO_DEFINIDA);
      sinEscrituras();
    });

    it.each(['Entregado', 'Rechazado', 'Cancelado por el Usuario'])(
      'R-6 · desde el estado final %s → 409 ESTADO_FINAL',
      async (estado) => {
        prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado }));

        const error = await rechazo();

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toBe(MENSAJES_TRANSICION_INVALIDA.ESTADO_FINAL);
        sinEscrituras();
      },
    );

    /** Record sobre la unión: un código de error nuevo sin caso aquí rompe tsc. */
    const PROPUESTA_INVALIDA: Record<ErrorHorario, readonly [string, string]> = {
      FIN_NO_POSTERIOR: ['2026-10-28T10:00:00-05:00', '2026-10-28T09:00:00-05:00'],
      EN_EL_PASADO: ['2026-10-05T08:00:00-05:00', '2026-10-05T09:00:00-05:00'],
      MULTIPLES_DIAS: ['2026-10-28T17:00:00-05:00', '2026-10-29T09:00:00-05:00'],
      DIA_NO_HABIL: ['2026-10-31T09:00:00-05:00', '2026-10-31T10:00:00-05:00'],
      FUERA_DE_BLOQUE: ['2026-10-28T12:30:00-05:00', '2026-10-28T13:30:00-05:00'],
    };

    it.each(Object.entries(PROPUESTA_INVALIDA) as [ErrorHorario, readonly [string, string]][])(
      'R-7 · K4: propuesta con %s → 400 con su mensaje, sin consultar CA-06 ni escribir',
      async (codigo, [inicio, fin]) => {
        const error = await rechazo(franja(inicio, fin));

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toBe(MENSAJES_ERROR_HORARIO[codigo]);
        expect(prismaMock.solicitud.findFirst).not.toHaveBeenCalled();
        sinEscrituras();
      },
    );

    it('R-8 · K4: proponer la franja actual → 400 sin evaluar nada más', async () => {
      const error = await rechazo({ ...OFICIAL });

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(MENSAJE_PROPUESTA_SIN_CAMBIOS);
      expect(prismaMock.solicitud.findFirst).not.toHaveBeenCalled();
      sinEscrituras();
    });

    it('R-9 · K5: CA-06 se evalúa sobre la PROPUESTA, excluyendo la propia solicitud → 409 sin fugas', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue({ ...solicitudBase, radicado: 'EC-2099-0777' });

      const error = await rechazo();

      expect(prismaMock.solicitud.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{ fecha_inicio: { lt: PROPUESTA.fecha_fin } }, { fecha_fin: { gt: PROPUESTA.fecha_inicio } }],
            NOT: { radicado: RADICADO },
          }),
        }),
      );
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_CA06);
      expect(JSON.stringify((error as ConflictException).getResponse())).not.toContain('EC-2099-0777');
      sinEscrituras();
    });

    it('R-10 · K2: en Recibido con una propuesta inválida gana el 409 del estado (orden de validación)', async () => {
      prismaMock.solicitud.findUnique.mockResolvedValue(guardada({ estado: 'Recibido' }));

      const error = await rechazo(franja('2026-10-31T09:00:00-05:00', '2026-10-31T10:00:00-05:00'));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_REPROGRAMAR_EN_RECIBIDO);
    });

    it('R-11 · D5: el solicitante canceló entre la lectura y la escritura → 409 sin log', async () => {
      prismaMock.solicitud.updateMany.mockResolvedValue({ count: 0 });
      const avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        const error = await rechazo();

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toBe(MENSAJE_CAMBIO_CONCURRENTE);
        expect(prismaMock.log_Auditoria.create).not.toHaveBeenCalled();
      } finally {
        avisos.mockRestore();
      }
    });

    it('R-12 · D-U: consulta el Reloj UNA sola vez por petición', async () => {
      const espia = jest.spyOn(reloj, 'ahora');

      await proponer();

      expect(espia).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne() — propiedad, proyección por rol y 404 uniforme (Fase 2)', () => {
    interface ArgsFindFirst {
      where: unknown;
      select: unknown;
    }
    const argsDeFindFirst = (): ArgsFindFirst =>
      prismaMock.solicitud.findFirst.mock.calls[0][0] as ArgsFindFirst;

    it('SOLICITANTE: filtra por su id en el WHERE y usa la proyección mínima', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue(solicitudBase);

      await service.findOne('EC-2099-0001', USUARIO_SOLICITANTE);

      const args = argsDeFindFirst();
      expect(args.where).toEqual({ radicado: 'EC-2099-0001', id_usuario: USUARIO_SOLICITANTE.id });
      expect(args.select).toBe(SELECT_DETALLE_SOLICITANTE);
    });

    it('STAFF: consulta sin filtro de propiedad y usa la proyección completa', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue(solicitudBase);

      await service.findOne('EC-2099-0001', USUARIO_STAFF);

      const args = argsDeFindFirst();
      expect(args.where).toEqual({ radicado: 'EC-2099-0001' });
      expect(args.select).toBe(SELECT_DETALLE_STAFF);
    });

    it('sin resultado responde 404 con mensaje genérico, sin reflejar el radicado', async () => {
      prismaMock.solicitud.findFirst.mockResolvedValue(null);

      const error: unknown = await service
        .findOne('EC-2099-9999', USUARIO_SOLICITANTE)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe(MENSAJE_SOLICITUD_NO_ENCONTRADA);
      expect((error as NotFoundException).message).not.toContain('EC-2099-9999');
    });

    it('la proyección del solicitante no expone identidades internas ni inventario', () => {
      expect(SELECT_DETALLE_SOLICITANTE).not.toHaveProperty('usuario');
      expect(SELECT_DETALLE_SOLICITANTE).not.toHaveProperty('id_usuario');
      expect(SELECT_DETALLE_SOLICITANTE.logs.select).not.toHaveProperty('modificado_por');
      expect(SELECT_DETALLE_SOLICITANTE.logs.select).not.toHaveProperty('id_log');
      expect(SELECT_DETALLE_SOLICITANTE.recursos.select.recurso.select).not.toHaveProperty(
        'cantidad_total',
      );
    });
  });
});
