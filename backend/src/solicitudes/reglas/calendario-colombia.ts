import {
  aClaveIso,
  asegurarFechaCivilValida,
  DiaSemana,
  diaDeLaSemana,
  type FechaCivil,
  sumarDias,
} from './fecha-civil';

/**
 * Calendario laboral de Colombia (Decisión D-M, ADR-003).
 *
 * Fuente normativa: Ley 51 de 1983 ("Ley Emiliani"). Define 18 festivos:
 *  - 6 fijos que no se trasladan;
 *  - 7 de fecha fija que se trasladan al lunes siguiente;
 *  - 5 que dependen del Domingo de Pascua (2 fijos y 3 trasladables).
 *
 * Es código puro: sin reloj, sin base de datos y sin zona horaria.
 */

/** La Ley 51 de 1983 rige desde 1984; antes de eso este cálculo no aplica. */
export const ANIO_MINIMO_SOPORTADO = 1984;
/** Límite del formato de 4 dígitos de `aClaveIso`. */
export const ANIO_MAXIMO_SOPORTADO = 9999;

export type NombreFestivo =
  | 'Año Nuevo'
  | 'Día de los Reyes Magos'
  | 'Día de San José'
  | 'Jueves Santo'
  | 'Viernes Santo'
  | 'Día del Trabajo'
  | 'Ascensión del Señor'
  | 'Corpus Christi'
  | 'Sagrado Corazón de Jesús'
  | 'San Pedro y San Pablo'
  | 'Día de la Independencia'
  | 'Batalla de Boyacá'
  | 'Asunción de la Virgen'
  | 'Día de la Raza'
  | 'Día de Todos los Santos'
  | 'Independencia de Cartagena'
  | 'Inmaculada Concepción'
  | 'Navidad';

export interface Festivo {
  readonly fecha: FechaCivil;
  readonly nombre: NombreFestivo;
}

/**
 * Puerto que consume el `HorarioValidator` (pasos 3.2 y 3.3). Permite agregar
 * después los cierres institucionales de CESMAG sin tocar el validador.
 */
export interface CalendarioLaboral {
  esDiaHabil(fecha: FechaCivil): boolean;
}

/**
 * Fail-closed: un año `NaN` (por ejemplo, de un `Date` inválido) haría que el
 * algoritmo devolviera fechas `NaN`, ningún día sería festivo y un festivo se
 * trataría como hábil. Es preferible lanzar un error.
 */
function asegurarAnioSoportado(anio: number): void {
  if (
    !Number.isInteger(anio) ||
    anio < ANIO_MINIMO_SOPORTADO ||
    anio > ANIO_MAXIMO_SOPORTADO
  ) {
    throw new RangeError(
      `Año fuera del rango soportado (${ANIO_MINIMO_SOPORTADO}–${ANIO_MAXIMO_SOPORTADO}).`,
    );
  }
}

/**
 * Domingo de Pascua del calendario gregoriano. Algoritmo anónimo de
 * Meeus/Jones/Butcher (Jean Meeus, *Astronomical Algorithms*, cap. 8).
 * Los nombres de una letra replican los del algoritmo publicado, para que
 * la auditoría pueda contrastarlo línea por línea.
 */
export function calcularDomingoDePascua(anio: number): FechaCivil {
  asegurarAnioSoportado(anio);

  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;

  return { anio, mes: Math.floor(n / 31), dia: (n % 31) + 1 };
}

/** Regla de la Ley Emiliani: si no cae en lunes, pasa al lunes siguiente. */
export function trasladarAlLunes(fecha: FechaCivil): FechaCivil {
  const dias = (8 - diaDeLaSemana(fecha)) % 7; // lunes → 0, domingo → 1, martes → 6
  return sumarDias(fecha, dias);
}

/**
 * Los 18 festivos del año, ordenados por fecha.
 *
 * Puede haber dos festivos en la misma fecha: el Sagrado Corazón y San Pedro
 * coinciden en algunos años (en 2025, ambos el 30 de junio). La ley no prevé
 * compensación, así que ambos se conservan en la lista y ese año tiene 17 días
 * festivos distintos.
 */
export function festivosDeColombia(anio: number): readonly Festivo[] {
  asegurarAnioSoportado(anio);

  const fijo = (mes: number, dia: number, nombre: NombreFestivo): Festivo => ({
    fecha: { anio, mes, dia },
    nombre,
  });
  const trasladable = (
    mes: number,
    dia: number,
    nombre: NombreFestivo,
  ): Festivo => ({
    fecha: trasladarAlLunes({ anio, mes, dia }),
    nombre,
  });

  const pascua = calcularDomingoDePascua(anio);
  const desdePascua = (dias: number, nombre: NombreFestivo): Festivo => ({
    fecha: sumarDias(pascua, dias),
    nombre,
  });
  const desdePascuaTrasladable = (
    dias: number,
    nombre: NombreFestivo,
  ): Festivo => ({
    fecha: trasladarAlLunes(sumarDias(pascua, dias)),
    nombre,
  });

  const festivos: Festivo[] = [
    // Fijos (no se trasladan)
    fijo(1, 1, 'Año Nuevo'),
    fijo(5, 1, 'Día del Trabajo'),
    fijo(7, 20, 'Día de la Independencia'),
    fijo(8, 7, 'Batalla de Boyacá'),
    fijo(12, 8, 'Inmaculada Concepción'),
    fijo(12, 25, 'Navidad'),
    // Trasladables al lunes (Ley 51 de 1983, art. 1)
    trasladable(1, 6, 'Día de los Reyes Magos'),
    trasladable(3, 19, 'Día de San José'),
    trasladable(6, 29, 'San Pedro y San Pablo'),
    trasladable(8, 15, 'Asunción de la Virgen'),
    trasladable(10, 12, 'Día de la Raza'),
    trasladable(11, 1, 'Día de Todos los Santos'),
    trasladable(11, 11, 'Independencia de Cartagena'),
    // Dependientes de la Pascua
    desdePascua(-3, 'Jueves Santo'),
    desdePascua(-2, 'Viernes Santo'),
    desdePascuaTrasladable(39, 'Ascensión del Señor'), // jueves → lunes (+43)
    desdePascuaTrasladable(60, 'Corpus Christi'), // jueves → lunes (+64)
    desdePascuaTrasladable(68, 'Sagrado Corazón de Jesús'), // viernes → lunes (+71)
  ];

  return Object.freeze(
    festivos.sort((x, y) =>
      aClaveIso(x.fecha).localeCompare(aClaveIso(y.fecha)),
    ),
  );
}

/**
 * Memoización por año: el resultado es una función pura del año, así que
 * guardarlo no rompe la pureza. Está acotada a 8.016 años posibles.
 */
const clavesPorAnio = new Map<number, ReadonlySet<string>>();

function clavesFestivas(anio: number): ReadonlySet<string> {
  const enCache = clavesPorAnio.get(anio);
  if (enCache !== undefined) {
    return enCache;
  }
  const claves: ReadonlySet<string> = new Set(
    festivosDeColombia(anio).map((festivo) => aClaveIso(festivo.fecha)),
  );
  clavesPorAnio.set(anio, claves);
  return claves;
}

export function esFestivoEnColombia(fecha: FechaCivil): boolean {
  asegurarFechaCivilValida(fecha);
  return clavesFestivas(fecha.anio).has(aClaveIso(fecha));
}

/** Día hábil = de lunes a viernes y no festivo (decisión de negocio, Fase 3). */
export const calendarioLaboralColombia: CalendarioLaboral = Object.freeze({
  esDiaHabil(fecha: FechaCivil): boolean {
    asegurarFechaCivilValida(fecha);
    const dia = diaDeLaSemana(fecha);
    if (dia === DiaSemana.SABADO || dia === DiaSemana.DOMINGO) {
      return false;
    }
    return !esFestivoEnColombia(fecha);
  },
});
