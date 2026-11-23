import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateUsuarioDto {
  @IsString()
  @IsNotEmpty()
  id_usuario: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsEmail()
  @Matches(/@unicesmag\.edu\.co$/, { 
    message: 'Acceso denegado: El correo debe ser institucional (@unicesmag.edu.co)' 
  })
  correo: string;
}