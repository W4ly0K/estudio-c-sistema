import { applyDecorators } from '@nestjs/common';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsDate } from 'class-validator';

/**
 * Fechas de entrada con zona horaria OBLIGATORIA (Decisión D-W, Fase 3).
 *
 * `new Date('2026-10-13T08:00')` interpreta el texto en la zona del servidor:
 * el mismo error de `getHours()` de la Fase 0, pero en la puerta de entrada.
 * Aquí solo se acepta ISO 8601 completo terminado en `Z` o en `±HH:MM`.
 */
const PATRON =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/;

const MS_POR_MINUTO = 60_000;

/**
 * Convierte el texto en un instante, o devuelve `null` si no es una fecha
 * real. V8 "normaliza" en silencio: `2026-02-30` pasa a ser el 2 de marzo y
 * `T24:00` el día siguiente. Por eso se verifica con un viaje de ida y vuelta
 * que cada componente sobreviva intacto.
 */
export function parsearFechaConZonaHoraria(texto: string): Date | null {
  const partes = PATRON.exec(texto);
  if (partes === null) {
    return null;
  }

  const [, a, me, d, h, mi, s = '0', fraccion = '0', zona, signo, zh, zm] =
    partes;
  const anio = Number(a);
  const mes = Number(me);
  const dia = Number(d);
  const hora = Number(h);
  const minuto = Number(mi);
  const segundo = Number(s);
  const ms = Number(fraccion.padEnd(3, '0'));

  if (hora > 23 || minuto > 59 || segundo > 59) {
    return null;
  }

  // Componentes como si fueran UTC, para comprobar que existen en el calendario.
  const comoUtc = Date.UTC(anio, mes - 1, dia, hora, minuto, segundo, ms);
  const verificacion = new Date(comoUtc);
  if (
    anio < 1000 ||
    verificacion.getUTCFullYear() !== anio ||
    verificacion.getUTCMonth() !== mes - 1 ||
    verificacion.getUTCDate() !== dia
  ) {
    return null;
  }

  let desfaseMin = 0;
  if (zona !== 'Z') {
    const horasZona = Number(zh);
    const minutosZona = Number(zm);
    if (horasZona > 14 || minutosZona > 59) {
      return null;
    }
    desfaseMin = (signo === '-' ? -1 : 1) * (horasZona * 60 + minutosZona);
  }

  // Hora local = UTC + desfase  ⇒  UTC = hora local − desfase.
  return new Date(comoUtc - desfaseMin * MS_POR_MINUTO);
}

export function FechaConZonaHoraria(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: TransformFnParams) => {
      const fecha =
        typeof value === 'string' ? parsearFechaConZonaHoraria(value) : null;
      // Un Date inválido hace fallar a @IsDate → 400 con el mensaje de abajo.
      return fecha ?? new Date(Number.NaN);
    }),
    IsDate({
      message:
        '$property debe ser una fecha ISO 8601 real con zona horaria explícita (por ejemplo, 2026-10-13T08:00:00-05:00 o 2026-10-13T13:00:00Z).',
    }),
  );
}
