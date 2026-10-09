import { PartialType } from '@nestjs/mapped-types';
import { CreateSolicitudeDto } from './create-solicitude.dto';
import { IsString, IsOptional, IsIn, ValidateIf, MinLength } from 'class-validator';
// Fuente única de los estados: la máquina de estados (Fase 5 · H6). El pipe solo
// valida que el nombre exista; la legalidad de la transición la decide el servicio.
import { ESTADOS } from '../reglas/maquina-estados';

export class UpdateSolicitudeDto extends PartialType(CreateSolicitudeDto) {
  @IsOptional()
  @IsIn(ESTADOS, { message: 'Estado no válido según la máquina de estados' })
  estado?: string;

  // Regla de Negocio: Si el estado es 'Rechazado', el motivo es obligatorio y debe tener al menos 10 caracteres
  @ValidateIf(o => o.estado === 'Rechazado')
  @IsString()
  @MinLength(10, { message: 'El motivo de rechazo es obligatorio y debe ser detallado (mínimo 10 caracteres)' })
  motivo_rechazo?: string;

  // modificado_por NO existe aquí por diseño (Zero Trust):
  // el autor de la auditoría se toma de req.user vía @UsuarioActual().
}