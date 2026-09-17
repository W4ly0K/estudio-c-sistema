import { IsString, IsNotEmpty, IsDate, MinDate } from 'class-validator';
import { Type } from 'class-transformer';

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
}