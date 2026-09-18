import { IsString, IsNotEmpty, IsDate, MinDate, IsArray, ValidateNested, IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

// Sub-clase para validar los recursos individuales del arreglo
class RecursoSolicitadoDto {
  @IsInt()
  @IsNotEmpty()
  id_recurso: number;

  @IsInt()
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  cantidad: number;
}

export class CreateSolicitudeDto {
  @IsString()
  @IsNotEmpty()
  id_usuario: string;

  @IsString()
  @IsNotEmpty()
  categoria: string;

  @IsString()
  @IsNotEmpty()
  proposito: string;

  @Type(() => Date)
  @IsDate({ message: 'La fecha de inicio debe tener un formato válido' })
  @MinDate(new Date(new Date().setHours(0, 0, 0, 0)), { 
    message: 'No puedes programar una solicitud en una fecha pasada' 
  })
  fecha_inicio: Date;

  @Type(() => Date)
  @IsDate()
  fecha_fin: Date;

  // Nuevo campo: Un arreglo de recursos opcional
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecursoSolicitadoDto)
  recursos?: RecursoSolicitadoDto[];
}