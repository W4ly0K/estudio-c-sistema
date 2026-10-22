import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { CategoriaSolicitud, SubEspacio } from '@prisma/client'; // <-- 1. Importamos los Enums de Prisma
import { FechaConZonaHoraria } from '../../common/validadores/fecha-con-zona-horaria.decorator';

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

  // Fase 3 (D-W): ISO 8601 con zona horaria obligatoria. La regla "no en el
  // pasado" ya NO vive aquí: @MinDate se evaluaba una sola vez al cargar el
  // módulo (fecha congelada). Ahora la aplica evaluarHorario con el Reloj.
  @FechaConZonaHoraria()
  fecha_inicio: Date;

  @FechaConZonaHoraria()
  fecha_fin: Date;

  // Fase 7 · ADR-007 SE5 (Q-A4): el solicitante PROPONE el sub-espacio; el Staff puede
  // ajustarlo al validar (T1). Opcional durante el expand: sin él se reserva el Estudio C
  // completo, exactamente como antes de la v2.2 (SUB_ESPACIO_POR_DEFECTO_TEMPORAL). En el
  // contract (7A.8) pasa a ser obligatorio, junto con el formulario del frontend.
  // UpdateSolicitudeDto lo hereda (PartialType); el servicio decide cuándo se admite (D-4).
  @IsOptional()
  @IsEnum(SubEspacio, {
    message: 'El sub-espacio debe ser CABINA_AUDIO, ESTUDIO_GRABACION o ESTUDIO_COMPLETO',
  })
  sub_espacio?: SubEspacio;

  // Nuevo campo: Un arreglo de recursos opcional
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecursoSolicitadoDto)
  recursos?: RecursoSolicitadoDto[];
}