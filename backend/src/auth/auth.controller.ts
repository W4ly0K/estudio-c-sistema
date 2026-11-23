import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { UsuarioActual } from './decorators/usuario-actual.decorator';
import type { PerfilUsuario } from './interfaces/perfil-usuario.interface';
import type { UsuarioAutenticado } from './interfaces/usuario-autenticado.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('google/login')
  async googleLogin(@Body('token') token: string) {
    if (!token) {
      throw new BadRequestException('El token de Google es requerido en el cuerpo de la petición.');
    }
    
    return this.authService.verifyGoogleToken(token);
  }

  // Fase 6.2 · DS1: "¿quién soy?" para restaurar la sesión al recargar. Sin @Public
  // (exige JWT) y sin @Roles (cualquier usuario autenticado). La identidad, del token.
  @Get('perfil')
  perfil(@UsuarioActual() usuario: UsuarioAutenticado): Promise<PerfilUsuario> {
    return this.authService.obtenerPerfil(usuario.id);
  }
}