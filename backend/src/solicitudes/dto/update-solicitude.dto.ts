import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateSolicitudeDto } from './create-solicitude.dto';
import { IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength, ValidateIf } from 'class-validator';
import { TextoConLongitudReal } from '../../common/validadores/texto-con-longitud-real.decorator';
// Fuente única de los estados: la máquina de estados (Fase 5 · H6). El pipe solo
// valida que el nombre exista; la legalidad de la transición la decide el servicio.
import { ESTADOS } from '../reglas/maquina-estados';

/**
 * Límites del motivo de rechazo (Fase 6.5b · DE1): los mismos del motivo de la
 * reprogramación. La migración 20261013120000_motivo_rechazo los repite en
 * Log_Auditoria_motivo_rechazo_longitud_check; la prueba de integración de alineación
 * deriva la definición esperada de estas constantes. El frontend las usará en el
 * formulario de rechazo (6.5.3), vigiladas por su prueba de deriva.
 */
export const MOTIVO_RECHAZO_MINIMO = 10;
export const MOTIVO_RECHAZO_MAXIMO = 500;
export const MENSAJE_MOTIVO_RECHAZO =
  `El motivo del rechazo es obligatorio y debe tener entre ${MOTIVO_RECHAZO_MINIMO} ` +
  `y ${MOTIVO_RECHAZO_MAXIMO} caracteres (sin contar los espacios de los extremos).`;

/** Fase 8 · requisito 4: el mismo límite del CHECK de la migración 20261028130000. */
export const ENLACE_ENTREGA_MAXIMO = 2048;
export const MENSAJE_ENLACE_ENTREGA =
  `El enlace del producto final debe empezar por https://, sin espacios ni usuario y contraseña, y tener hasta ${ENLACE_ENTREGA_MAXIMO} caracteres.`;

/**
 * Fase 8 · H2: la categoría NO se hereda al PATCH. Gobierna el lugar (SE10), el camino de
 * estados (T9, o T11 y T12) y la entrega (enlace): cambiarla a mitad del flujo dejaría estados
 * imposibles. Al no declararse, el pipe global (forbidNonWhitelisted) responde 400
 * "property categoria should not exist", el mismo mecanismo que protege modificado_por.
 */
export class UpdateSolicitudeDto extends PartialType(OmitType(CreateSolicitudeDto, ['categoria'] as const)) {
  @IsOptional()
  @IsIn(ESTADOS, { message: 'Estado no válido según la máquina de estados' })
  estado?: string;

  // T2: al pedir 'Rechazado' el motivo es obligatorio, se guarda recortado y se mide en
  // caracteres reales, igual que char_length() del CHECK (Fase 6.5b · DE1). Con otro
  // estado el pipe no lo valida: un motivo huérfano lo rechaza E5 en el servicio.
  @ValidateIf((dto: UpdateSolicitudeDto) => dto.estado === 'Rechazado')
  @TextoConLongitudReal(MOTIVO_RECHAZO_MINIMO, MOTIVO_RECHAZO_MAXIMO, MENSAJE_MOTIVO_RECHAZO)
  motivo_rechazo?: string;

  // Fase 8 · requisito 4: el pipe valida la FORMA si llega. Si aplica a la categoría y al
  // destino lo decide el servicio (igual que E5 con el motivo). @Matches repite el CHECK del
  // motor: @IsUrl aceptaría "HTTPS://", que el CHECK rechazaría con un 500.
  @IsOptional()
  @IsString({ message: MENSAJE_ENLACE_ENTREGA })
  @MaxLength(ENLACE_ENTREGA_MAXIMO, { message: MENSAJE_ENLACE_ENTREGA })
  @Matches(/^https:\/\/\S+$/, { message: MENSAJE_ENLACE_ENTREGA })
  @IsUrl(
    { protocols: ['https'], require_protocol: true, require_tld: true, disallow_auth: true },
    { message: MENSAJE_ENLACE_ENTREGA },
  )
  enlace_entrega?: string;

  // modificado_por NO existe aquí por diseño (Zero Trust):
  // el autor de la auditoría se toma de req.user vía @UsuarioActual().
}