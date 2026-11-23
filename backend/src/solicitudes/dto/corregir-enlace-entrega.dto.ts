import { IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { ENLACE_MAXIMO, EnlaceSeguro } from '../../common/validadores/enlace-seguro.decorator';
import { TextoConLongitudReal } from '../../common/validadores/texto-con-longitud-real.decorator';
import { MENSAJE_ENLACE_ENTREGA } from './update-solicitude.dto';

/**
 * Límites del motivo de la corrección (ADR-008 EN10, D8): los mismos de los demás motivos. La
 * migración 20261109110000_enlace_anexo los repite en B9 (Log_Auditoria_motivo_correccion_longitud_check);
 * corregir-enlace-entrega.dto.spec.ts compara las dos.
 */
export const MOTIVO_CORRECCION_MINIMO = 10;
export const MOTIVO_CORRECCION_MAXIMO = 500;

/** Fase 9 · DJ3-3. */
export const MENSAJE_ENTREGA_ANTERIOR_FORMA =
  `enlace_entrega_anterior debe ser el enlace que se vio en el detalle (texto no vacío, hasta ${ENLACE_MAXIMO} caracteres).`;
export const MENSAJE_MOTIVO_CORRECCION =
  `Si se indica, el motivo de la corrección debe tener entre ${MOTIVO_CORRECCION_MINIMO} y ${MOTIVO_CORRECCION_MAXIMO} ` +
  'caracteres (sin contar los espacios de los extremos).';

/**
 * Fase 9 · ADR-008 EN7 y EN10 (lote J3): cuerpo de PATCH /solicitudes/:radicado/enlace-entrega. Los dos
 * enlaces son obligatorios y NO admiten null: no se corrige una entrega sin enlace previo (EN8) ni se
 * retira el enlace (B4). Un campo desconocido → 400 (forbidNonWhitelisted).
 */
export class CorregirEnlaceEntregaDto {
  // EN9 · D9: el enlace que vio el Staff, para COMPARAR exactamente con el vigente: sin recortar ni
  // EnlaceSeguro. Ausente, null, '' o solo espacios → 400.
  @IsString({ message: MENSAJE_ENTREGA_ANTERIOR_FORMA })
  @Matches(/\S/, { message: MENSAJE_ENTREGA_ANTERIOR_FORMA })
  @MaxLength(ENLACE_MAXIMO, { message: MENSAJE_ENTREGA_ANTERIOR_FORMA })
  enlace_entrega_anterior: string;

  // El enlace corregido, con la misma forma que al entregar (fuente única EnlaceSeguro, DTO ⊆ CHECK).
  // Sin @IsOptional: null o ausente → 400.
  @EnlaceSeguro(MENSAJE_ENLACE_ENTREGA)
  enlace_entrega: string;

  // EN10 · D8: opcional. Solo la propiedad ausente se omite; null, '' y solo espacios → 400 (con
  // @IsOptional, null pasaría sin validar y se convertiría en «sin motivo»). Se guarda recortado: B9 mide
  // char_length(btrim(…)) y TextoConLongitudReal cuenta puntos de código, como char_length.
  @ValidateIf((dto: CorregirEnlaceEntregaDto) => dto.motivo_correccion !== undefined)
  @TextoConLongitudReal(MOTIVO_CORRECCION_MINIMO, MOTIVO_CORRECCION_MAXIMO, MENSAJE_MOTIVO_CORRECCION)
  motivo_correccion?: string;
}
