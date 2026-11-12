import { IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { ENLACE_MAXIMO, EnlaceSeguro } from '../../common/validadores/enlace-seguro.decorator';
import { MENSAJE_ENLACE_ANEXO } from './create-solicitude.dto';

/** Fase 9 · ADR-009 AN11 (DJ2-3): forma del valor anterior observado. */
export const MENSAJE_ANEXO_ANTERIOR_FORMA =
  `enlace_anexo_anterior debe ser null o el enlace que se vio en el detalle (texto no vacío, hasta ${ENLACE_MAXIMO} caracteres).`;

/**
 * Fase 9 · ADR-009 AN10 a AN14 (lote J2): cuerpo de PATCH /solicitudes/:radicado/anexo. Las DOS
 * propiedades son obligatorias y admiten null; ninguna lleva @IsOptional (trataría igual a null y a
 * ausente). Cada ValidateIf solo omite la validación con null: si la propiedad no viene, sus
 * validadores corren y responden 400. Un campo desconocido → 400 (forbidNonWhitelisted).
 */
export class EditarAnexoDto {
  // D9: el anexo que el solicitante vio. null = «vi que no había anexo». Es un valor para COMPARAR
  // exactamente con el vigente: sin recortar ni EnlaceSeguro (igual que anexo_revisado, ADR-005 E7).
  // '' y solo espacios → 400: null es la única manera de decir «no había anexo».
  @ValidateIf((dto: EditarAnexoDto) => dto.enlace_anexo_anterior !== null)
  @IsString({ message: MENSAJE_ANEXO_ANTERIOR_FORMA })
  @Matches(/\S/, { message: MENSAJE_ANEXO_ANTERIOR_FORMA })
  @MaxLength(ENLACE_MAXIMO, { message: MENSAJE_ANEXO_ANTERIOR_FORMA })
  enlace_anexo_anterior: string | null;

  // AN12 · D1: el anexo nuevo, o null para retirarlo. Si es texto, la misma forma que al radicar
  // (fuente única EnlaceSeguro, DTO ⊆ CHECK Solicitud_enlace_anexo_formato_check).
  @ValidateIf((dto: EditarAnexoDto) => dto.enlace_anexo !== null)
  @EnlaceSeguro(MENSAJE_ENLACE_ANEXO)
  enlace_anexo: string | null;
}
