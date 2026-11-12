import {
  FILTRO_EVENTOS_DE_ENLACE,
  FILTRO_LOGS_DE_TRANSICION,
  SELECT_DETALLE_SOLICITANTE,
  SELECT_DETALLE_STAFF,
  SELECT_HISTORIAL_ENLACES,
} from './detalle-solicitud.proyeccion';

/*
 * Fase 9 · ADR-012 EV7 (lote I-2). Las dos proyecciones filtran `logs` a las transiciones y, fuera
 * de eso, quedan iguales: mismas claves de la solicitud, mismas columnas de cada log y mismo orden.
 * La prueba de comportamiento contra PostgreSQL real es I-41 (test/integracion/proyecciones-enlaces).
 */

const COLUMNAS_DE_ENLACE = ['enlace_campo', 'enlace_anterior', 'enlace_nuevo', 'motivo_correccion'];

const PROYECCIONES = [
  {
    nombre: 'Staff',
    select: SELECT_DETALLE_STAFF,
    claves: [
      'radicado',
      'id_usuario',
      'categoria',
      'proposito',
      'num_participantes',
      'fecha_inicio',
      'fecha_fin',
      'fecha_propuesta_inicio',
      'fecha_propuesta_fin',
      'estado',
      'es_urgencia',
      'sub_espacio',
      'sub_espacio_propuesto',
      'enlace_entrega',
      'enlace_anexo',
      'usuario',
      'recursos',
      'logs',
    ],
    columnasDelLog: [
      'id_log',
      'estado_anterior',
      'estado_nuevo',
      'modificado_por',
      'fecha_modificacion',
      'motivo_rechazo',
      'motivo_reprogramacion',
    ],
  },
  {
    nombre: 'Solicitante',
    select: SELECT_DETALLE_SOLICITANTE,
    claves: [
      'radicado',
      'categoria',
      'proposito',
      'num_participantes',
      'fecha_inicio',
      'fecha_fin',
      'fecha_propuesta_inicio',
      'fecha_propuesta_fin',
      'estado',
      'es_urgencia',
      'sub_espacio',
      'sub_espacio_propuesto',
      'enlace_entrega',
      'enlace_anexo',
      'recursos',
      'logs',
    ],
    columnasDelLog: ['estado_anterior', 'estado_nuevo', 'fecha_modificacion', 'motivo_rechazo', 'motivo_reprogramacion'],
  },
] as const;

describe('Proyecciones de detalle · logs solo con transiciones (ADR-012 EV7)', () => {
  it('el filtro compartido deja pasar solo los logs sin enlace_campo (las transiciones)', () => {
    expect(FILTRO_LOGS_DE_TRANSICION).toStrictEqual({ enlace_campo: null });
  });

  describe.each(PROYECCIONES)('$nombre', ({ select, claves, columnasDelLog }) => {
    it('logs usa el filtro compartido de transiciones', () => {
      expect(select.logs.where).toBe(FILTRO_LOGS_DE_TRANSICION);
    });

    it('logs conserva el orden ascendente por fecha', () => {
      expect(select.logs.orderBy).toStrictEqual({ fecha_modificacion: 'asc' });
    });

    it('logs conserva exactamente sus columnas y no expone las de enlace', () => {
      expect(Object.keys(select.logs.select)).toEqual(columnasDelLog);
      for (const columna of COLUMNAS_DE_ENLACE) expect(select.logs.select).not.toHaveProperty(columna);
    });

    it('la respuesta conserva exactamente sus claves', () => {
      expect(Object.keys(select)).toEqual(claves);
    });
  });
});

describe('Historial de enlaces del Staff (ADR-012 EV7 · lote J2b)', () => {
  it('el filtro es el complemento del de transiciones sobre la misma columna (IS NOT NULL frente a IS NULL)', () => {
    expect(FILTRO_EVENTOS_DE_ENLACE).toStrictEqual({ enlace_campo: { not: null } });
    expect(Object.keys(FILTRO_EVENTOS_DE_ENLACE)).toEqual(Object.keys(FILTRO_LOGS_DE_TRANSICION));
  });

  it('usa el filtro de eventos y el orden cronológico ascendente con id_log para desempatar', () => {
    expect(SELECT_HISTORIAL_ENLACES.where).toBe(FILTRO_EVENTOS_DE_ENLACE);
    expect(SELECT_HISTORIAL_ENLACES.orderBy).toStrictEqual([{ fecha_modificacion: 'asc' }, { id_log: 'asc' }]);
  });

  it('lee exactamente los siete campos permitidos, sin estados ni el radicado', () => {
    expect(Object.keys(SELECT_HISTORIAL_ENLACES.select)).toEqual([
      'id_log',
      'enlace_campo',
      'enlace_anterior',
      'enlace_nuevo',
      'motivo_correccion',
      'modificado_por',
      'fecha_modificacion',
    ]);
  });
});
