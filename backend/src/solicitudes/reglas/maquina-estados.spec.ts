import { RolUsuario } from '@prisma/client';
import {
  ACCIONES,
  ESTADO_INICIAL,
  ESTADOS,
  ESTADOS_FINALES,
  TRANSICIONES,
  esEstado,
  esEstadoFinal,
  evaluarAccion,
  evaluarTransicion,
  type Accion,
  type Estado,
  type IdTransicion,
  type ResultadoTransicion,
} from './maquina-estados';
import { ESTADOS_QUE_LIBERAN_FRANJA, ocupaFranja } from './estados';

const { STAFF, SOLICITANTE } = RolUsuario;
const ROLES = [STAFF, SOLICITANTE] as const;

/**
 * ORÁCULO: transcripción independiente del diagrama "Modelado de la Máquina de
 * Estados" y del PRD §5.5/§8. Las pruebas comparan contra esta lista, nunca
 * contra TRANSICIONES (eso sería una tautología).
 */
const DIAGRAMA: ReadonlyArray<readonly [IdTransicion, Accion, Estado, Estado, RolUsuario]> = [
  ['T1', 'APROBAR', 'Recibido', 'Validado', STAFF],
  ['T2', 'RECHAZAR', 'Recibido', 'Rechazado', STAFF],
  ['T3', 'CANCELAR', 'Recibido', 'Cancelado por el Usuario', SOLICITANTE],
  ['T4', 'INICIAR_PRODUCCION', 'Validado', 'En Producción', STAFF],
  ['T5', 'PROPONER_REPROGRAMACION', 'Validado', 'Pendiente de Reprogramación', STAFF],
  ['T6', 'CANCELAR', 'Validado', 'Cancelado por el Usuario', SOLICITANTE],
  ['T7', 'ACEPTAR_REPROGRAMACION', 'Pendiente de Reprogramación', 'Validado', SOLICITANTE],
  ['T8', 'RECHAZAR_REPROGRAMACION', 'Pendiente de Reprogramación', 'Cancelado por el Usuario', SOLICITANTE],
  ['T9', 'FINALIZAR', 'En Producción', 'Entregado', STAFF],
];

/** Finales según el diagrama (estados que solo conducen al nodo final). */
const FINALES_ESPERADOS: readonly Estado[] = ['Entregado', 'Rechazado', 'Cancelado por el Usuario'];

type Esperado = { permitida: true; id: IdTransicion } | { permitida: false; motivo: string };

/** Lo que el diagrama dice que debe responder evaluarTransicion. */
function esperadoTransicion(origen: Estado, destino: Estado, rol: RolUsuario): Esperado {
  if (origen === destino) return { permitida: false, motivo: 'MISMO_ESTADO' };
  if (FINALES_ESPERADOS.includes(origen)) return { permitida: false, motivo: 'ESTADO_FINAL' };
  const delPar = DIAGRAMA.filter(([, , o, d]) => o === origen && d === destino);
  if (delPar.length === 0) return { permitida: false, motivo: 'TRANSICION_NO_DEFINIDA' };
  const delRol = delPar.find(([, , , , r]) => r === rol);
  return delRol ? { permitida: true, id: delRol[0] } : { permitida: false, motivo: 'ROL_NO_AUTORIZADO' };
}

/** Lo que el diagrama dice que debe responder evaluarAccion. */
function esperadoAccion(accion: Accion, origen: Estado, rol: RolUsuario): Esperado {
  if (FINALES_ESPERADOS.includes(origen)) return { permitida: false, motivo: 'ESTADO_FINAL' };
  const deLaAccion = DIAGRAMA.filter(([, a, o]) => a === accion && o === origen);
  if (deLaAccion.length === 0) return { permitida: false, motivo: 'TRANSICION_NO_DEFINIDA' };
  const delRol = deLaAccion.find(([, , , , r]) => r === rol);
  return delRol ? { permitida: true, id: delRol[0] } : { permitida: false, motivo: 'ROL_NO_AUTORIZADO' };
}

/** Reduce el resultado real a la forma del oráculo para compararlos con toEqual. */
function resumir(resultado: ResultadoTransicion): Esperado {
  return resultado.permitida
    ? { permitida: true, id: resultado.transicion.id }
    : { permitida: false, motivo: resultado.motivo };
}

const COMBINACIONES_TRANSICION: Array<[Estado, Estado, RolUsuario]> = ESTADOS.flatMap((origen) =>
  ESTADOS.flatMap((destino) => ROLES.map((rol): [Estado, Estado, RolUsuario] => [origen, destino, rol])),
);

const COMBINACIONES_ACCION: Array<[Accion, Estado, RolUsuario]> = ACCIONES.flatMap((accion) =>
  ESTADOS.flatMap((origen) => ROLES.map((rol): [Accion, Estado, RolUsuario] => [accion, origen, rol])),
);

describe('maquina-estados: la tabla coincide con el diagrama', () => {
  it('TRANSICIONES es exactamente T1–T9 del diagrama, en orden', () => {
    expect(TRANSICIONES.map((t) => [t.id, t.accion, t.origen, t.destino, t.rol])).toEqual(DIAGRAMA);
  });

  it('declara los 7 estados del PRD y las 8 acciones, sin duplicados', () => {
    expect(new Set(ESTADOS)).toEqual(
      new Set([
        'Recibido',
        'Validado',
        'En Producción',
        'Entregado',
        'Rechazado',
        'Cancelado por el Usuario',
        'Pendiente de Reprogramación',
      ]),
    );
    expect(new Set(ESTADOS).size).toBe(7);
    expect(new Set(ACCIONES).size).toBe(8);
  });

  it('los estados finales son Entregado, Rechazado y Cancelado por el Usuario (D1: sin reactivación)', () => {
    expect(new Set(ESTADOS_FINALES)).toEqual(new Set(FINALES_ESPERADOS));
  });

  it('el estado inicial es Recibido', () => {
    expect(ESTADO_INICIAL).toBe('Recibido');
  });
});

describe('maquina-estados: invariantes estructurales', () => {
  it('ningún par (origen, destino) ni (acción, origen) está repetido: la búsqueda es inequívoca', () => {
    const pares = TRANSICIONES.map((t) => `${t.origen}→${t.destino}`);
    const accionesPorOrigen = TRANSICIONES.map((t) => `${t.accion}@${t.origen}`);
    expect(new Set(pares).size).toBe(TRANSICIONES.length);
    expect(new Set(accionesPorOrigen).size).toBe(TRANSICIONES.length);
  });

  it('ninguna transición es un bucle (origen ≠ destino)', () => {
    expect(TRANSICIONES.filter((t) => t.origen === t.destino)).toEqual([]);
  });

  it('todos los estados son alcanzables desde Recibido', () => {
    const alcanzados = new Set<Estado>([ESTADO_INICIAL]);
    const pendientes: Estado[] = [ESTADO_INICIAL];
    for (let actual = pendientes.pop(); actual !== undefined; actual = pendientes.pop()) {
      for (const t of TRANSICIONES.filter((x) => x.origen === actual)) {
        if (!alcanzados.has(t.destino)) {
          alcanzados.add(t.destino);
          pendientes.push(t.destino);
        }
      }
    }
    expect(alcanzados).toEqual(new Set(ESTADOS));
  });

  it('cada acción del catálogo se usa en al menos una transición', () => {
    expect(new Set(TRANSICIONES.map((t) => t.accion))).toEqual(new Set(ACCIONES));
  });

  it('reparto de roles: 5 transiciones del STAFF y 4 del SOLICITANTE (PRD §4)', () => {
    expect(TRANSICIONES.filter((t) => t.rol === STAFF).map((t) => t.id)).toEqual(['T1', 'T2', 'T4', 'T5', 'T9']);
    expect(TRANSICIONES.filter((t) => t.rol === SOLICITANTE).map((t) => t.id)).toEqual(['T3', 'T6', 'T7', 'T8']);
  });

  it('PRD §5.5: el STAFF nunca puede llevar una solicitud a "Cancelado por el Usuario"', () => {
    for (const origen of ESTADOS) {
      const resultado = evaluarTransicion(origen, 'Cancelado por el Usuario', STAFF);
      expect(resultado.permitida).toBe(false);
    }
  });

  it('la tabla y sus filas están congeladas en tiempo de ejecución', () => {
    expect(Object.isFrozen(ESTADOS)).toBe(true);
    expect(Object.isFrozen(ACCIONES)).toBe(true);
    expect(Object.isFrozen(TRANSICIONES)).toBe(true);
    expect(Object.isFrozen(ESTADOS_FINALES)).toBe(true);
    expect(TRANSICIONES.every((t) => Object.isFrozen(t))).toBe(true);
  });
});

describe('maquina-estados: coherencia con CA-06 (estados.ts)', () => {
  it('todo estado que libera la franja es un estado final y existe en la máquina', () => {
    for (const estado of ESTADOS_QUE_LIBERAN_FRANJA) {
      expect(esEstado(estado)).toBe(true);
      expect(esEstadoFinal(estado)).toBe(true);
    }
  });

  it('D3: "Pendiente de Reprogramación" sigue ocupando su franja original', () => {
    expect(ocupaFranja('Pendiente de Reprogramación')).toBe(true);
  });

  it('solo Rechazado y Cancelado por el Usuario liberan la franja; los demás la ocupan', () => {
    expect(new Set(ESTADOS.filter((estado) => !ocupaFranja(estado)))).toEqual(
      new Set(['Rechazado', 'Cancelado por el Usuario']),
    );
  });
});

describe('evaluarTransicion: las 98 combinaciones (7 × 7 × 2 roles)', () => {
  it('genera exactamente 98 casos y solo 9 permitidos', () => {
    expect(COMBINACIONES_TRANSICION).toHaveLength(98);
    const permitidas = COMBINACIONES_TRANSICION.filter(([o, d, r]) => evaluarTransicion(o, d, r).permitida);
    expect(permitidas).toHaveLength(9);
  });

  it.each(COMBINACIONES_TRANSICION)('%s → %s como %s', (origen, destino, rol) => {
    expect(resumir(evaluarTransicion(origen, destino, rol))).toEqual(esperadoTransicion(origen, destino, rol));
  });
});

describe('evaluarAccion: las 112 combinaciones (8 acciones × 7 estados × 2 roles)', () => {
  it('genera exactamente 112 casos y solo 9 permitidos', () => {
    expect(COMBINACIONES_ACCION).toHaveLength(112);
    const permitidas = COMBINACIONES_ACCION.filter(([a, o, r]) => evaluarAccion(a, o, r).permitida);
    expect(permitidas).toHaveLength(9);
  });

  it.each(COMBINACIONES_ACCION)('%s desde %s como %s', (accion, origen, rol) => {
    expect(resumir(evaluarAccion(accion, origen, rol))).toEqual(esperadoAccion(accion, origen, rol));
  });

  it('cada acción permitida lleva al mismo destino que su transición (las dos vistas no divergen)', () => {
    for (const [id, accion, origen, destino, rol] of DIAGRAMA) {
      const porAccion = evaluarAccion(accion, origen, rol);
      const porPar = evaluarTransicion(origen, destino, rol);
      expect(porAccion).toEqual(porPar);
      expect(resumir(porAccion)).toEqual({ permitida: true, id });
    }
  });
});

describe('fail-closed: estados que no pertenecen a la máquina', () => {
  // Variantes realistas de datos sucios: mayúsculas, sin tilde, espacios, nombres parciales,
  // cadenas vacías y claves del prototipo de Object.
  const DESCONOCIDOS = [
    '',
    'recibido',
    'RECIBIDO',
    'Recibido ',
    ' Recibido',
    'En Produccion',
    'Cancelado',
    'Pendiente',
    'toString',
    '__proto__',
    'constructor',
  ];

  it.each(DESCONOCIDOS)('origen desconocido %j → ESTADO_DESCONOCIDO (transición y acción)', (valor) => {
    for (const rol of ROLES) {
      expect(evaluarTransicion(valor, 'Validado', rol)).toEqual({ permitida: false, motivo: 'ESTADO_DESCONOCIDO' });
      expect(evaluarAccion('APROBAR', valor, rol)).toEqual({ permitida: false, motivo: 'ESTADO_DESCONOCIDO' });
    }
  });

  it.each(DESCONOCIDOS)('destino desconocido %j → ESTADO_DESCONOCIDO', (valor) => {
    for (const rol of ROLES) {
      expect(evaluarTransicion('Recibido', valor, rol)).toEqual({ permitida: false, motivo: 'ESTADO_DESCONOCIDO' });
    }
  });

  it('esEstado acepta solo los 7 nombres exactos', () => {
    expect(ESTADOS.every((estado) => esEstado(estado))).toBe(true);
    expect(DESCONOCIDOS.some((valor) => esEstado(valor))).toBe(false);
  });
});

describe('casos de negocio nombrados (lectura humana de la tabla)', () => {
  it('D1: no existe la reactivación desde Rechazado ni desde Cancelado por el Usuario', () => {
    for (const final of ['Rechazado', 'Cancelado por el Usuario'] as const) {
      for (const destino of ESTADOS.filter((e) => e !== final)) {
        for (const rol of ROLES) {
          expect(evaluarTransicion(final, destino, rol)).toEqual({ permitida: false, motivo: 'ESTADO_FINAL' });
        }
      }
    }
  });

  it('dato heredado de producción: Rechazado → En Producción queda prohibido', () => {
    expect(evaluarTransicion('Rechazado', 'En Producción', STAFF)).toEqual({
      permitida: false,
      motivo: 'ESTADO_FINAL',
    });
  });

  it('la solicitud heredada en "En Producción" solo puede avanzar a Entregado (T9)', () => {
    const salidas = ESTADOS.filter((destino) => evaluarTransicion('En Producción', destino, STAFF).permitida);
    expect(salidas).toEqual(['Entregado']);
  });

  it('CA-10: el SOLICITANTE no puede proponer reprogramaciones ni el STAFF aceptarlas', () => {
    expect(evaluarAccion('PROPONER_REPROGRAMACION', 'Validado', SOLICITANTE)).toEqual({
      permitida: false,
      motivo: 'ROL_NO_AUTORIZADO',
    });
    expect(evaluarAccion('ACEPTAR_REPROGRAMACION', 'Pendiente de Reprogramación', STAFF)).toEqual({
      permitida: false,
      motivo: 'ROL_NO_AUTORIZADO',
    });
  });

  it('CA-10: "Pendiente de Reprogramación" queda congelada para el STAFF (sin salidas propias)', () => {
    const salidasStaff = ESTADOS.filter(
      (destino) => evaluarTransicion('Pendiente de Reprogramación', destino, STAFF).permitida,
    );
    expect(salidasStaff).toEqual([]);
  });

  it('el solicitante no puede cancelar una vez iniciada la producción (PRD §4)', () => {
    expect(evaluarAccion('CANCELAR', 'En Producción', SOLICITANTE)).toEqual({
      permitida: false,
      motivo: 'TRANSICION_NO_DEFINIDA',
    });
  });

  it('no se puede saltar etapas: Recibido → En Producción ni Validado → Entregado', () => {
    expect(evaluarTransicion('Recibido', 'En Producción', STAFF)).toEqual({
      permitida: false,
      motivo: 'TRANSICION_NO_DEFINIDA',
    });
    expect(evaluarTransicion('Validado', 'Entregado', STAFF)).toEqual({
      permitida: false,
      motivo: 'TRANSICION_NO_DEFINIDA',
    });
  });
});