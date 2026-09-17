import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateRecursoDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del recurso es obligatorio' })
  nombre: string;

  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(0, { message: 'La cantidad total no puede ser negativa' })
  cantidad_total: number;
}