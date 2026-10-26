import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsOptional, IsEnum, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { CategoriaSolicitud, SubEspacio } from '@prisma/client'; // <-- 1. Importamos los Enums de Prisma
import { FechaConZonaHoraria } from '../../common/validadores/fecha-con-zona-horaria.decorator';

/**
 * Fase 7 · 7B.4 (ADR-007 SE10): un solo mensaje para las dos fallas del pipe (falta en una
 * solicitud de espacio físico, o llega un valor que no existe). Que un servicio NO lleve
 * sub-espacio lo decide el servicio (MENSAJE_SUBESPACIO_SOLO_EN_ESPACIOS).
 */
export const MENSAJE_SUBESPACIO_DE_CREACION =
  'El sub-espacio debe ser CABINA_AUDIO, ESTUDIO_GRABACION o ESTUDIO_COMPLETO (obligatorio en una solicitud de espacio físico).';

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

  // Fase 7 · 7B.4 (ADR-007 SE10, directriz del 26/10/2026): el solicitante elige el
  // sub-espacio SOLO en una solicitud de espacio físico, y ahí es obligatorio (CA-12). En las
  // demás categorías el pipe solo exige que, si llega, sea un valor real; que no deba llegar
  // lo decide el servicio con subEspacioAlRadicar() (400 con su propio mensaje).
  // UpdateSolicitudeDto lo hereda: PartialType le suma su @IsOptional y class-validator exige
  // que TODAS las condiciones se cumplan, así que en el PATCH solo se valida si viene (D-4).
  @ValidateIf(
    (dto: CreateSolicitudeDto) => dto.categoria === CategoriaSolicitud.ESPACIOS || dto.sub_espacio !== undefined,
  )
  @IsEnum(SubEspacio, { message: MENSAJE_SUBESPACIO_DE_CREACION })
  sub_espacio?: SubEspacio;

  // Nuevo campo: Un arreglo de recursos opcional
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecursoSolicitadoDto)
  recursos?: RecursoSolicitadoDto[];
}