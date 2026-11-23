import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CampoEnlace, SubEspacio } from '@prisma/client';
import {
  type CamposDeTransicion,
  datosDelLog,
  ESTADO_DEL_EVENTO_DE_ENLACE,
  type EventoAuditoria,
} from './evento-auditoria';

/*
 * Fase 9 · ADR-012 EV6 (lote I-1). Unitarias de la función pura y pruebas de COMPILACIÓN: cada
 * @ts-expect-error marca una combinación que el tipo debe rechazar. Si el tipo se afloja, la línea deja
 * de ser un error, el @ts-expect-error queda sin usar y `tsc --noEmit` falla.
 */

const RADICADO = 'EC-2099-0001';
const ENLACE_A = 'https://drive.google.com/file/d/anterior/view';
const ENLACE_B = 'https://drive.google.com/file/d/nuevo/view';
const MOTIVO = 'El enlace registrado apuntaba a una versión sin editar.';
const COLUMNAS_DE_ENLACE = ['enlace_campo', 'enlace_anterior', 'enlace_nuevo', 'motivo_correccion'] as const;

describe('datosDelLog (ADR-012 EV6)', () => {
  describe('TRANSICION: exactamente los datos de antes de EV6', () => {
    const casos: readonly (readonly [string, CamposDeTransicion])[] = [
      [
        'cancelación (estados y autor)',
        { estado_anterior: 'Recibido', estado_nuevo: 'Cancelado por el Usuario', modificado_por: 'uuid-solicitante' },
      ],
      [
        'PATCH del tablero sin motivo: la clave motivo_rechazo viaja como undefined, igual que antes',
        { estado_anterior: 'Validado', estado_nuevo: 'En Producción', modificado_por: 'uuid-staff', motivo_rechazo: undefined },
      ],
      [
        'T2 con motivo de rechazo',
        {
          estado_anterior: 'Recibido',
          estado_nuevo: 'Rechazado',
          modificado_por: 'uuid-staff',
          motivo_rechazo: 'La cabina está en mantenimiento.',
        },
      ],
      [
        'T1 con ajuste de sub-espacio y franja',
        {
          estado_anterior: 'Recibido',
          estado_nuevo: 'Validado',
          modificado_por: 'uuid-staff',
          motivo_rechazo: undefined,
          sub_espacio_anterior: SubEspacio.ESTUDIO_COMPLETO,
          sub_espacio_nuevo: SubEspacio.CABINA_AUDIO,
          fecha_inicio_anterior: new Date('2099-03-02T15:00:00.000Z'),
          fecha_fin_anterior: new Date('2099-03-02T17:00:00.000Z'),
        },
      ],
      [
        'T5 con motivo de reprogramación',
        {
          estado_anterior: 'Recibido',
          estado_nuevo: 'Pendiente de Reprogramación',
          modificado_por: 'uuid-staff',
          motivo_reprogramacion: 'El Estudio C tiene mantenimiento ese día.',
        },
      ],
    ];

    it.each(casos)('%s', (_caso, log) => {
      const datos = datosDelLog(RADICADO, { tipo: 'TRANSICION', log });

      // toStrictEqual distingue una clave con undefined de una ausente: mismas claves, mismos valores.
      expect(datos).toStrictEqual({ radicado_solicitud: RADICADO, ...log });
      expect(Object.keys(datos)).toEqual(['radicado_solicitud', ...Object.keys(log)]);
      for (const columna of COLUMNAS_DE_ENLACE) expect(datos).not.toHaveProperty(columna);
    });
  });

  describe('ENLACE_ANEXO', () => {
    const anexo = (enlace_anterior: string | null, enlace_nuevo: string | null) =>
      datosDelLog(RADICADO, { tipo: 'ENLACE_ANEXO', modificado_por: 'uuid-solicitante', enlace_anterior, enlace_nuevo });
    const esperado = (enlace_anterior: string | null, enlace_nuevo: string | null) => ({
      radicado_solicitud: RADICADO,
      estado_anterior: 'Recibido',
      estado_nuevo: 'Recibido',
      modificado_por: 'uuid-solicitante',
      enlace_campo: CampoEnlace.ANEXO,
      enlace_anterior,
      enlace_nuevo,
    });

    it('agrega un anexo (NULL → URL)', () => {
      expect(anexo(null, ENLACE_B)).toStrictEqual(esperado(null, ENLACE_B));
    });

    it('cambia el anexo (URL → otra URL)', () => {
      expect(anexo(ENLACE_A, ENLACE_B)).toStrictEqual(esperado(ENLACE_A, ENLACE_B));
    });

    it('retira el anexo (URL → NULL, D1)', () => {
      expect(anexo(ENLACE_A, null)).toStrictEqual(esperado(ENLACE_A, null));
    });

    it('nunca lleva motivo de corrección (B8)', () => {
      expect(anexo(ENLACE_A, ENLACE_B)).not.toHaveProperty('motivo_correccion');
    });
  });

  describe('ENLACE_ENTREGA', () => {
    const base = {
      radicado_solicitud: RADICADO,
      estado_anterior: 'Entregado',
      estado_nuevo: 'Entregado',
      modificado_por: 'uuid-staff',
      enlace_campo: CampoEnlace.ENTREGA,
      enlace_anterior: ENLACE_A,
      enlace_nuevo: ENLACE_B,
    };

    it('sin motivo: la clave motivo_correccion no viaja (D8)', () => {
      const datos = datosDelLog(RADICADO, {
        tipo: 'ENLACE_ENTREGA',
        modificado_por: 'uuid-staff',
        enlace_anterior: ENLACE_A,
        enlace_nuevo: ENLACE_B,
      });

      expect(datos).toStrictEqual(base);
      expect(datos).not.toHaveProperty('motivo_correccion');
    });

    it('con motivo: se guarda tal como llega', () => {
      const datos = datosDelLog(RADICADO, {
        tipo: 'ENLACE_ENTREGA',
        modificado_por: 'uuid-staff',
        enlace_anterior: ENLACE_A,
        enlace_nuevo: ENLACE_B,
        motivo_correccion: MOTIVO,
      });

      expect(datos).toStrictEqual({ ...base, motivo_correccion: MOTIVO });
    });
  });

  it('fail-closed: un tipo desconocido en ejecución lanza un error y no arma datos', () => {
    const desconocido = { tipo: 'OTRO' } as unknown as EventoAuditoria;

    expect(() => datosDelLog(RADICADO, desconocido)).toThrow('Evento de auditoría sin datos definidos: OTRO');
  });

  it('el estado de cada evento de enlace coincide con B4 de la migración consolidada (H1)', () => {
    const sql = readFileSync(
      join(__dirname, '../../../prisma/migrations/20261109110000_enlace_anexo/migration.sql'),
      'utf8',
    );

    for (const [campo, estado] of Object.entries(ESTADO_DEL_EVENTO_DE_ENLACE)) {
      expect(sql).toContain(`enlace_campo = '${campo}' AND estado_nuevo = '${estado}'`);
    }
  });
});

// --- Pruebas de COMPILACIÓN: combinaciones que el tipo rechaza (las verifica `tsc --noEmit`). ---

const TRANSICION_BASE = { estado_anterior: 'Recibido', estado_nuevo: 'Validado', modificado_por: 'uuid-staff' };

export const _combinacionesInvalidas: readonly EventoAuditoria[] = [
  {
    tipo: 'TRANSICION',
    log: {
      ...TRANSICION_BASE,
      // @ts-expect-error — EV6 y B8: una transición no lleva motivo de corrección
      motivo_correccion: MOTIVO,
    },
  },
  {
    tipo: 'TRANSICION',
    log: {
      ...TRANSICION_BASE,
      // @ts-expect-error — EV6 y B1: una transición no lleva columnas de enlace
      enlace_campo: CampoEnlace.ANEXO,
    },
  },
  {
    tipo: 'ENLACE_ANEXO',
    modificado_por: 'uuid-solicitante',
    enlace_anterior: ENLACE_A,
    enlace_nuevo: ENLACE_B,
    // @ts-expect-error — B8: un cambio del anexo no lleva motivo de corrección
    motivo_correccion: MOTIVO,
  },
  {
    tipo: 'ENLACE_ANEXO',
    modificado_por: 'uuid-solicitante',
    enlace_anterior: null,
    enlace_nuevo: ENLACE_B,
    // @ts-expect-error — B3 y B4: el estado de un evento de enlace no lo elige quien llama
    estado_nuevo: 'Validado',
  },
  {
    tipo: 'ENLACE_ENTREGA',
    modificado_por: 'uuid-staff',
    enlace_anterior: ENLACE_A,
    // @ts-expect-error — B4: el enlace de entrega no se retira
    enlace_nuevo: null,
  },
  {
    tipo: 'ENLACE_ENTREGA',
    modificado_por: 'uuid-staff',
    // @ts-expect-error — D2: no se corrige una entrega que nunca tuvo enlace
    enlace_anterior: null,
    enlace_nuevo: ENLACE_B,
  },
  {
    tipo: 'ENLACE_ENTREGA',
    modificado_por: 'uuid-staff',
    enlace_anterior: ENLACE_A,
    enlace_nuevo: ENLACE_B,
    // @ts-expect-error — B4: la columna enlace_campo la fija la función, no quien llama
    enlace_campo: CampoEnlace.ANEXO,
  },
];

// @ts-expect-error — EV6: no existe un evento sin tipo conocido
export const _tipoInexistente: EventoAuditoria = { tipo: 'OTRO', modificado_por: 'uuid-staff' };
