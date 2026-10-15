import { PartialType } from '@nestjs/mapped-types';
import { CreateSolicitudeDto } from './create-solicitude.dto';
import { IsOptional, IsIn, ValidateIf } from 'class-validator';
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

export class UpdateSolicitudeDto extends PartialType(CreateSolicitudeDto) {
  @IsOptional()
  @IsIn(ESTADOS, { message: 'Estado no válido según la máquina de estados' })
  estado?: string;

  // T2: al pedir 'Rechazado' el motivo es obligatorio, se guarda recortado y se mide en
  // caracteres reales, igual que char_length() del CHECK (Fase 6.5b · DE1). Con otro
  // estado el pipe no lo valida: un motivo huérfano lo rechaza E5 en el servicio.
  @ValidateIf((dto: UpdateSolicitudeDto) => dto.estado === 'Rechazado')
  @TextoConLongitudReal(MOTIVO_RECHAZO_MINIMO, MOTIVO_RECHAZO_MAXIMO, MENSAJE_MOTIVO_RECHAZO)
  motivo_rechazo?: string;

  // modificado_por NO existe aquí por diseño (Zero Trust):
  // el autor de la auditoría se toma de req.user vía @UsuarioActual().
}