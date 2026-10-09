import { ConflictException, Logger } from '@nestjs/common';
import { CategoriaSolicitud, PrismaClient, RolUsuario, Solicitud } from '@prisma/client';
import { MENSAJE_CAMBIO_CONCURRENTE, SolicitudesService } from '../../src/solicitudes/solicitudes.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { UsuarioAutenticado } from '../../src/auth/interfaces/usuario-autenticado.interface';
import { MENSAJE_CA06 } from '../../src/solicitudes/errores/traslape-ca06';
import { evaluarTransicion, type Estado } from '../../src/solicitudes/reglas/maquina-estados';
import { RelojFijo } from '../utils/reloj-fijo';
import { crearPrismaDeIntegracion, vaciarTablas } from './bd-integracion';

/**
 * Fase 5.6 · concurrencia de la máquina de estados contra PostgreSQL REAL.
 *  - I-11a…e (BARRERA): las dos peticiones leen el MISMO estado y pasan la máquina antes
 *    de que ninguna escriba. Es el peor orden posible y se fuerza en CADA ejecución: el
 *    compare-and-set decide siempre, nunca "casi siempre".
 *  - I-11f (LIBRE): PostgreSQL decide el orden; se verifican propiedades que valen en
 *    CUALQUIER orden (nunca 500, historial legal según la máquina, ninguna actualización perdida).
 *  - I-19 (N2): la misma franja propuesta a varias solicitudes; gana quien acepta primero.
 */
const AHORA = new Date('2026-10-05T10:00:00-05:00'); // lunes, 10:00 en Bogotá
const HORA_MS = 60 * 60 * 1000;
const PENDIENTE: Estado = 'Pendiente de Reprogramación';
const CANCELADO: Estado = 'Cancelado por el Usuario';
const MOTIVO = 'La franja no está disponible en el Estudio C';
const RONDAS_LIBRES = 10;

const STAFF_A = 'uuid-staff-a';
const STAFF_B = 'uuid-staff-b';
const solicitante = (sufijo: string): UsuarioAutenticado =>
  Object.freeze({ id: `uuid-solicitante-${sufijo}`, correo: `solicitante-${sufijo}@prueba.local`, rol: RolUsuario.SOLICITANTE });
const SOLICITANTE = solicitante('mc');
const ROLES = new Map<string, RolUsuario>([
  [STAFF_A, RolUsuario.STAFF],
  [STAFF_B, RolUsuario.STAFF],
  [SOLICITANTE.id, RolUsuario.SOLICITANTE],
]);

interface Franja {
  inicio: Date;
  fin: Date;
}

function elemento<T>(lista: readonly T[], indice: number): T {
  const valor = lista[indice];
  if (valor === undefined) throw new Error(`Índice ${indice} fuera de rango (${lista.length} elementos)`);
  return valor;
}

/** Franja oficial n: se inserta directo (sin CA-04); un día distinto por n desde el 1-dic, 08:00 Bogotá. */
const oficial = (n: number): Franja => {
  const inicio = new Date(Date.UTC(2026, 11, 1 + n, 13));
  return { inicio, fin: new Date(inicio.getTime() + HORA_MS) };
};

/** Franja propuesta n: hábil y dentro de un bloque de atención (CA-04), sin festivos (2 y 16-nov). */
const DIAS_HABILES = [
  '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-03', '2026-11-04', '2026-11-05',
  '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
] as const;
const HORAS = [8, 9, 10, 14, 15, 16] as const;
const propuesta = (n: number): Franja => {
  const dia = elemento(DIAS_HABILES, Math.floor(n / HORAS.length));
  const hora = String(elemento(HORAS, n % HORAS.length)).padStart(2, '0');
  const inicio = new Date(`${dia}T${hora}:00:00-05:00`);
  return { inicio, fin: new Date(inicio.getTime() + HORA_MS) };
};

/** Puntos de prueba sobre métodos privados del servicio (tipado explícito, sin any). */
interface PuntosDePrueba {
  escribirConCompareAndSet: (op: unknown) => Promise<unknown>;
}

/** Barrera de n participantes con límite de tiempo: un fallo previo nunca cuelga la suite. */
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
      temporizador = setTimeout(
        () => rechazar(new Error(`Barrera: llegaron ${llegados} de ${participantes} en ${limiteMs} ms`)),
        limiteMs,
      );
    });
    try {
      await Promise.race([abierta, limite]);
    } finally {
      clearTimeout(temporizador);
    }
  };
}

interface Operacion {
  readonly etiqueta: string;
  readonly destino: Estado;
  readonly ejecutar: () => Promise<unknown>;
}

interface Par {
  readonly id: string;
  readonly descripcion: string;
  readonly inicial: Estado;
  readonly operaciones: (radicado: string, n: number) => readonly [Operacion, Operacion];
}

describe('Concurrencia de la máquina de estados contra PostgreSQL real (integración · Fase 5.6)', () => {
  let prisma: PrismaClient;
  let service: SolicitudesService;
  let avisos: jest.SpyInstance;

  beforeAll(() => {
    prisma = crearPrismaDeIntegracion();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await vaciarTablas(prisma);
    await prisma.usuario.createMany({
      data: [
        { id_usuario: STAFF_A, nombre: 'Staff A', correo: 'staff-a@prueba.local', rol: RolUsuario.STAFF },
        { id_usuario: STAFF_B, nombre: 'Staff B', correo: 'staff-b@prueba.local', rol: RolUsuario.STAFF },
        { id_usuario: SOLICITANTE.id, nombre: 'Solicitante', correo: SOLICITANTE.correo, rol: RolUsuario.SOLICITANTE },
      ],
    });
    // Mismo patrón que I-1 (ca06.int-spec.ts): el cliente de integración en lugar de PrismaService.
    service = new SolicitudesService(prisma as unknown as PrismaService, new RelojFijo(AHORA));
    avisos = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --- Operaciones del sistema, tal como las ejecutan los controladores ---------------
  const aprobar = (r: string): Operacion => ({
    etiqueta: 'T1 aprobar (Staff A)', destino: 'Validado',
    ejecutar: () => service.update(r, { estado: 'Validado' }, STAFF_A),
  });
  const rechazar = (r: string): Operacion => ({
    etiqueta: 'T2 rechazar (Staff B)', destino: 'Rechazado',
    ejecutar: () => service.update(r, { estado: 'Rechazado', motivo_rechazo: MOTIVO }, STAFF_B),
  });
  const cancelar = (r: string): Operacion => ({
    etiqueta: 'T3/T6 cancelar', destino: CANCELADO,
    ejecutar: () => service.cancelar(r, SOLICITANTE),
  });
  const iniciarProduccion = (r: string): Operacion => ({
    etiqueta: 'T4 iniciar producción', destino: 'En Producción',
    ejecutar: () => service.update(r, { estado: 'En Producción' }, STAFF_A),
  });
  const proponer = (r: string, n: number): Operacion => ({
    etiqueta: 'T5 proponer', destino: PENDIENTE,
    ejecutar: () => {
      const franja = propuesta(n);
      return service.proponerReprogramacion(r, { fecha_inicio: franja.inicio, fecha_fin: franja.fin }, STAFF_A);
    },
  });
  const aceptar = (r: string): Operacion => ({
    etiqueta: 'T7 aceptar', destino: 'Validado',
    ejecutar: () => service.aceptarReprogramacion(r, SOLICITANTE),
  });
  const rechazarPropuesta = (r: string): Operacion => ({
    etiqueta: 'T8 rechazar propuesta', destino: CANCELADO,
    ejecutar: () => service.rechazarReprogramacion(r, SOLICITANTE),
  });

  const PARES: readonly Par[] = [
    { id: 'I-11a', descripcion: 'dos Staff: aprobar contra rechazar', inicial: 'Recibido',
      operaciones: (r) => [aprobar(r), rechazar(r)] },
    { id: 'I-11b', descripcion: 'el Staff aprueba mientras el solicitante cancela', inicial: 'Recibido',
      operaciones: (r) => [aprobar(r), cancelar(r)] },
    { id: 'I-11c', descripcion: 'iniciar producción contra cancelar', inicial: 'Validado',
      operaciones: (r) => [iniciarProduccion(r), cancelar(r)] },
    { id: 'I-11d', descripcion: 'proponer reprogramación contra cancelar', inicial: 'Validado',
      operaciones: (r, n) => [proponer(r, n), cancelar(r)] },
    { id: 'I-11e', descripcion: 'doble respuesta: aceptar contra rechazar la propuesta', inicial: PENDIENTE,
      operaciones: (r) => [aceptar(r), rechazarPropuesta(r)] },
  ];

  // --- Utilidades -----------------------------------------------------------------------
  interface Siembra {
    radicado: string;
    estado: Estado;
    n: number;
    propuestaFija?: Franja;
    dueno?: string;
  }

  /** Inserta saltándose el servicio. Con estado Pendiente siembra también la propuesta (K9). */
  const sembrar = (s: Siembra) => {
    const franja = oficial(s.n);
    const conPropuesta = s.estado === PENDIENTE ? (s.propuestaFija ?? propuesta(s.n)) : undefined;
    return prisma.solicitud.create({
      data: {
        radicado: s.radicado,
        id_usuario: s.dueno ?? SOLICITANTE.id,
        categoria: CategoriaSolicitud.VIDEO,
        proposito: 'Concurrencia de la máquina de estados',
        fecha_inicio: franja.inicio,
        fecha_fin: franja.fin,
        fecha_propuesta_inicio: conPropuesta?.inicio ?? null,
        fecha_propuesta_fin: conPropuesta?.fin ?? null,
        estado: s.estado,
      },
    });
  };

  const leer = (radicado: string): Promise<Solicitud> => prisma.solicitud.findUniqueOrThrow({ where: { radicado } });

  const rechazosDe = (resultados: PromiseSettledResult<unknown>[]): unknown[] =>
    resultados.flatMap((r): unknown[] => (r.status === 'rejected' ? [r.reason] : []));

  const avisosCon = (texto: string): number =>
    avisos.mock.calls.filter(([mensaje]: unknown[]) => String(mensaje).includes(texto)).length;

  /** Fuerza el peor orden: cada escritura espera a que ambas peticiones hayan validado. */
  const instalarBarrera = (participantes: number): jest.SpyInstance => {
    const puntos = service as unknown as PuntosDePrueba;
    const escrituraReal = puntos.escribirConCompareAndSet.bind(service);
    const llegar = crearBarrera(participantes);
    return jest.spyOn(puntos, 'escribirConCompareAndSet').mockImplementation(async (op) => {
      await llegar();
      return escrituraReal(op);
    });
  };

  /**
   * El historial del log, encadenado desde el estado sembrado y verificado con la MÁQUINA
   * como oráculo. Se encadena por estado_anterior (id_log es un uuid sin orden): dos logs
   * con el mismo estado_anterior serían dos transiciones desde la misma versión de la fila,
   * es decir, una actualización perdida.
   */
  const historial = async (radicado: string, inicial: Estado): Promise<{ transiciones: number; estadoFinal: string }> => {
    const logs = await prisma.log_Auditoria.findMany({ where: { radicado_solicitud: radicado } });
    expect(new Set(logs.map((l) => l.estado_anterior)).size).toBe(logs.length);
    const pendientes = [...logs];
    let actual: string = inicial;
    while (pendientes.length > 0) {
      const indice = pendientes.findIndex((l) => l.estado_anterior === actual);
      expect(indice).toBeGreaterThanOrEqual(0);
      const [log] = pendientes.splice(indice, 1);
      if (!log) break;
      const rol = ROLES.get(log.modificado_por);
      expect(rol).toBeDefined();
      if (rol === undefined) break;
      expect(evaluarTransicion(log.estado_anterior, log.estado_nuevo, rol).permitida).toBe(true);
      actual = log.estado_nuevo;
    }
    return { transiciones: logs.length, estadoFinal: actual };
  };

  /** K9 en la fila leída (el motor ya lo garantiza; aquí se documenta el resultado). */
  const verificarK9 = (fila: Solicitud): void => {
    expect(fila.fecha_propuesta_inicio === null).toBe(fila.fecha_propuesta_fin === null);
    expect(fila.estado === PENDIENTE).toBe(fila.fecha_propuesta_inicio !== null);
  };

  // --- I-11a…e · BARRERA ----------------------------------------------------------------
  for (const par of PARES) {
    it(`${par.id} · BARRERA: ${par.descripcion} → exactamente 1 gana y la otra pierde el compare-and-set`, async () => {
      const radicado = `EC-${par.id}`;
      await sembrar({ radicado, estado: par.inicial, n: 0 });
      const escrituras = instalarBarrera(2);
      const operaciones = par.operaciones(radicado, 0);

      const resultados = await Promise.allSettled(operaciones.map((o) => o.ejecutar()));

      // Las dos validaron sobre el MISMO estado y llegaron a escribir: la carrera ocurrió.
      expect(escrituras).toHaveBeenCalledTimes(2);
      const ganadoras = operaciones.filter((_o, i) => resultados[i]?.status === 'fulfilled');
      const rechazos = rechazosDe(resultados);
      expect(ganadoras).toHaveLength(1);
      expect(rechazos).toHaveLength(1);
      expect(rechazos[0]).toBeInstanceOf(ConflictException);
      expect((rechazos[0] as ConflictException).message).toBe(MENSAJE_CAMBIO_CONCURRENTE);
      expect(avisosCon('Compare-and-set perdido')).toBe(1);

      const fila = await leer(radicado);
      expect(fila.estado).toBe(ganadoras[0]?.destino);
      expect(await historial(radicado, par.inicial)).toEqual({ transiciones: 1, estadoFinal: fila.estado });
      verificarK9(fila);
    });
  }

  // --- I-11f · LIBRE (propiedades) -------------------------------------------------------
  it(`I-11f · LIBRE: ${RONDAS_LIBRES} rondas × ${PARES.length} pares sin barrera → nunca 500, historial legal y ninguna actualización perdida`, async () => {
    const resumen = { compareAndSet: 0, maquina: 0, dobleExito: 0, pares: 0 };
    let n = 0;
    for (let ronda = 0; ronda < RONDAS_LIBRES; ronda++) {
      for (const par of PARES) {
        const radicado = `EC-L${ronda}-${par.id}`;
        await sembrar({ radicado, estado: par.inicial, n });
        const operaciones = par.operaciones(radicado, n);
        n += 1;

        const resultados = await Promise.allSettled(operaciones.map((o) => o.ejecutar()));

        const exitos = resultados.filter((r) => r.status === 'fulfilled').length;
        const rechazos = rechazosDe(resultados);
        for (const rechazo of rechazos) {
          // Nunca un 500: todo choque termina en un 409 explicable.
          expect(rechazo).toBeInstanceOf(ConflictException);
          if ((rechazo as ConflictException).message === MENSAJE_CAMBIO_CONCURRENTE) resumen.compareAndSet += 1;
          else resumen.maquina += 1;
        }
        expect(exitos).toBeGreaterThanOrEqual(1);
        if (exitos === 2) resumen.dobleExito += 1;
        resumen.pares += 1;

        const fila = await leer(radicado);
        // Éxitos = transiciones en el log y el estado guardado = el final del historial.
        expect(await historial(radicado, par.inicial)).toEqual({ transiciones: exitos, estadoFinal: fila.estado });
        verificarK9(fila);
      }
    }
    console.info(
      `I-11f · ${resumen.pares} choques: ${resumen.compareAndSet} resueltos por el compare-and-set, ` +
        `${resumen.maquina} por la máquina, ${resumen.dobleExito} con doble éxito legítimo (p. ej. T1 y luego T6)`,
    );
  }, 300_000);

  // --- I-19 · N2: la misma franja propuesta a varias solicitudes ------------------------
  it('I-19 · N2: 4 solicitantes aceptan a la vez la MISMA franja propuesta → 1 Validado y 3 con el 409 de CA-06', async () => {
    const PARTICIPANTES = 4;
    const franja = propuesta(0);
    const duenos = Array.from({ length: PARTICIPANTES }, (_v, i) => solicitante(`i19-${i}`));
    await prisma.usuario.createMany({
      data: duenos.map((d) => ({ id_usuario: d.id, nombre: `Solicitante ${d.id}`, correo: d.correo, rol: RolUsuario.SOLICITANTE })),
    });
    const radicados = duenos.map((_d, i) => `EC-I19-${i}`);
    for (const [i, radicado] of radicados.entries()) {
      await sembrar({ radicado, estado: PENDIENTE, n: i, propuestaFija: franja, dueno: elemento(duenos, i).id });
    }

    const resultados = await Promise.allSettled(
      radicados.map((radicado, i) => service.aceptarReprogramacion(radicado, elemento(duenos, i))),
    );

    const rechazos = rechazosDe(resultados);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rechazos).toHaveLength(PARTICIPANTES - 1);
    for (const rechazo of rechazos) {
      expect(rechazo).toBeInstanceOf(ConflictException);
      expect((rechazo as ConflictException).message).toBe(MENSAJE_CA06);
    }

    const filas = await prisma.solicitud.findMany({ where: { radicado: { in: radicados } }, orderBy: { radicado: 'asc' } });
    const validadas = filas.filter((f) => f.estado === 'Validado');
    expect(validadas).toHaveLength(1);
    expect(validadas[0]).toMatchObject({ fecha_inicio: franja.inicio, fecha_fin: franja.fin, fecha_propuesta_inicio: null });
    for (const [i, fila] of filas.entries()) {
      verificarK9(fila);
      if (fila.estado === 'Validado') continue;
      // Las perdedoras quedan intactas: Pendiente, su franja oficial y la propuesta (opción (a) de 5.5).
      expect(fila).toMatchObject({ estado: PENDIENTE, fecha_inicio: oficial(i).inicio, fecha_propuesta_inicio: franja.inicio });
    }
    expect(await prisma.log_Auditoria.count()).toBe(1);

    const porElMotor = avisosCon('restricción del motor');
    console.info(`I-19 · ${PARTICIPANTES - 1} rechazos: ${porElMotor} resueltos por el motor (23P01), ${PARTICIPANTES - 1 - porElMotor} por la consulta previa`);
  });
});
