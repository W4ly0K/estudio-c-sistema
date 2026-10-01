/**
 * Fecha del calendario civil: año, mes y día, sin hora ni zona horaria.
 *
 * Las reglas de negocio de horario (CA-04, días hábiles, festivos) hablan de
 * "días", no de instantes. Separar ambos conceptos evita la clase de error de
 * la Fase 0 (`getHours()` dependiente de la zona horaria del servidor).
 *
 * Toda la aritmética usa los métodos UTC de `Date` como una simple calculadora
 * de calendario: nunca se leen los métodos locales (`getDay`, `getDate`…), de
 * modo que el resultado es idéntico en cualquier servidor.
 */
export interface FechaCivil {
  readonly anio: number;
  /** 1 = enero … 12 = diciembre (no el 0–11 de `Date`). */
  readonly mes: number;
  readonly dia: number;
}

export const DiaSemana = {
  DOMINGO: 0,
  LUNES: 1,
  MARTES: 2,
  MIERCOLES: 3,
  JUEVES: 4,
  VIERNES: 5,
  SABADO: 6,
} as const;

export type DiaSemana = (typeof DiaSemana)[keyof typeof DiaSemana];

function aInstanteUtc(fecha: FechaCivil): Date {
  return new Date(Date.UTC(fecha.anio, fecha.mes - 1, fecha.dia));
}

function deInstanteUtc(instante: Date): FechaCivil {
  return {
    anio: instante.getUTCFullYear(),
    mes: instante.getUTCMonth() + 1,
    dia: instante.getUTCDate(),
  };
}

/**
 * `Date.UTC` "normaliza" en silencio (31 de febrero → 3 de marzo). Aquí se
 * detecta con un viaje de ida y vuelta: si la fecha cambió, no existía.
 */
export function esFechaCivilValida(fecha: FechaCivil): boolean {
  const { anio, mes, dia } = fecha;
  if (
    !Number.isInteger(anio) ||
    !Number.isInteger(mes) ||
    !Number.isInteger(dia)
  ) {
    return false;
  }
  const normalizada = deInstanteUtc(aInstanteUtc(fecha));
  return (
    normalizada.anio === anio &&
    normalizada.mes === mes &&
    normalizada.dia === dia
  );
}

/** Fail-closed: una fecha imposible es un error de programación, no un "día hábil". */
export function asegurarFechaCivilValida(fecha: FechaCivil): void {
  if (!esFechaCivilValida(fecha)) {
    throw new RangeError('Fecha civil inválida.');
  }
}

export function sumarDias(fecha: FechaCivil, dias: number): FechaCivil {
  if (!Number.isInteger(dias)) {
    throw new RangeError('La cantidad de días debe ser un entero.');
  }
  const instante = aInstanteUtc(fecha);
  instante.setUTCDate(instante.getUTCDate() + dias);
  return deInstanteUtc(instante);
}

export function diaDeLaSemana(fecha: FechaCivil): DiaSemana {
  // ECMAScript garantiza que getUTCDay() devuelve un entero entre 0 y 6.
  return aInstanteUtc(fecha).getUTCDay() as DiaSemana;
}

/** Clave estable `AAAA-MM-DD`, útil para conjuntos y mensajes. */
export function aClaveIso(fecha: FechaCivil): string {
  const anio = String(fecha.anio).padStart(4, '0');
  const mes = String(fecha.mes).padStart(2, '0');
  const dia = String(fecha.dia).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Orden cronológico entre dos fechas civiles (Decisión D-R): −1, 0 o 1.
 * Compara año, mes y día como números; nunca convierte a instantes.
 */
export function compararFechas(a: FechaCivil, b: FechaCivil): -1 | 0 | 1 {
  const diferencia = a.anio - b.anio || a.mes - b.mes || a.dia - b.dia;
  return diferencia < 0 ? -1 : diferencia > 0 ? 1 : 0;
}
