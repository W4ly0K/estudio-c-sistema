import { applyDecorators } from '@nestjs/common';
import { Transform, type TransformFnParams } from 'class-transformer';
import { ValidateBy } from 'class-validator';

/**
 * Longitud en caracteres REALES (puntos de código Unicode), igual que char_length()
 * de PostgreSQL. String.length cuenta unidades UTF-16: '🎬'.length es 2, pero el
 * motor cuenta 1. Si el DTO midiera con .length, un texto que el DTO acepta podría
 * violar un CHECK del motor y responder 500 (Fase 6.1b, Decisión DB2).
 */
export function longitudReal(texto: string): number {
  return [...texto].length;
}

/**
 * Texto obligatorio, sin los espacios de los extremos y con longitud real entre
 * `minimo` y `maximo`. Un único validador y un único mensaje: el cliente recibe una
 * sola explicación, falte el campo, no sea texto o tenga una longitud inválida.
 */
export function TextoConLongitudReal(minimo: number, maximo: number, mensaje: string): PropertyDecorator {
  return applyDecorators(
    // Se guarda recortado: el valor del log es exactamente el que se validó.
    Transform(({ value }: TransformFnParams): unknown => {
      const crudo: unknown = value;
      return typeof crudo === 'string' ? crudo.trim() : crudo;
    }),
    ValidateBy({
      name: 'textoConLongitudReal',
      constraints: [minimo, maximo],
      validator: {
        validate: (valor: unknown): boolean => {
          if (typeof valor !== 'string') return false;
          const longitud = longitudReal(valor);
          return longitud >= minimo && longitud <= maximo;
        },
        defaultMessage: (): string => mensaje,
      },
    }),
  );
}
