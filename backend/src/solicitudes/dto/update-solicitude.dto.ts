import { PartialType } from '@nestjs/mapped-types';
import { CreateSolicitudeDto } from './create-solicitude.dto';
import { IsString, IsOptional, IsIn, ValidateIf, MinLength } from 'class-validator';

// Definimos los estados exactos de tu diagrama
const ESTADOS_PERMITIDOS = [
  'Recibido', 'Validado', 'En Producción', 'Entregado', 
  'Rechazado', 'Cancelado por el Usuario', 'Pendiente de Reprogramación'
];

export class UpdateSolicitudeDto extends PartialType(CreateSolicitudeDto) {
  @IsOptional()
  @IsIn(ESTADOS_PERMITIDOS, { message: 'Estado no válido según la máquina de estados' })
  estado?: string;

  // Regla de Negocio: Si el estado es 'Rechazado', el motivo es obligatorio y debe tener al menos 10 caracteres
  @ValidateIf(o => o.estado === 'Rechazado')
  @IsString()
  @MinLength(10, { message: 'El motivo de rechazo es obligatorio y debe ser detallado (mínimo 10 caracteres)' })
  motivo_rechazo?: string;

  @IsOptional()
  @IsString()
  modificado_por?: string; // ID del Staff que realiza la acción
}