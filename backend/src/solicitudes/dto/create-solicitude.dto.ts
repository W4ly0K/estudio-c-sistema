import { IsString, IsNotEmpty, IsDate, MinDate, IsArray, ValidateNested, IsInt, Min, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { CategoriaSolicitud } from '@prisma/client'; // <-- 1. Importamos el Enum de Prisma

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
  // ELIMINADO: id_usuario ya no se recibe del frontend por seguridad. 
  // El controlador lo extrae directamente del token JWT.

  // 2. Reemplazamos @IsString() por @IsEnum()
  @IsEnum(CategoriaSolicitud, { 
    message: 'La categoría debe ser PODCAST, VIDEO, ESPACIOS, STREAMING o ASESORIAS' 
  })
  @IsNotEmpty()
  categoria: CategoriaSolicitud; // <-- 3. Cambiamos el tipo de string al Enum estricto

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