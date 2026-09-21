import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google/login')
  async googleLogin(@Body('token') token: string) {
    if (!token) {
      throw new BadRequestException('El token de Google es requerido en el cuerpo de la petición.');
    }
    
    return this.authService.verifyGoogleToken(token);
  }
}