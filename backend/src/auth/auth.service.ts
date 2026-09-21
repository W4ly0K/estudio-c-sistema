import { Injectable, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async verifyGoogleToken(token: string) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();

      // 1. Escudo contra payload undefined
      if (!payload) {
        throw new UnauthorizedException('No se pudo obtener la información del token de Google.');
      }

      // 2. Validación Estricta de Dominio
      if (payload.hd !== 'unicesmag.edu.co') {
        throw new UnauthorizedException('Acceso denegado: Solo se permiten correos institucionales de UNICESMAG.');
      }

      const correo = payload.email;
      const nombre = payload.name || 'Usuario'; // Fallback por si Google omite el nombre

      if (!correo) {
        throw new UnauthorizedException('El token no contiene un correo electrónico válido.');
      }

      // 3. Aprovisionamiento en DB
      let usuario = await this.prisma.usuario.findUnique({
        where: { correo },
      });

      if (!usuario) {
        usuario = await this.prisma.usuario.create({
          data: {
            correo,
            nombre,
            rol: 'SOLICITANTE', 
          },
        });
      }

      // 4. Emisión del JWT (La expiración ya está delegada al AuthModule)
      const jwtPayload = { sub: usuario.id_usuario, correo: usuario.correo, rol: usuario.rol };
      const backendToken = this.jwtService.sign(jwtPayload);

      return {
        mensaje: 'Autenticación exitosa',
        token: backendToken,
        usuario: {
          id: usuario.id_usuario,
          nombre: usuario.nombre,
          rol: usuario.rol,
        },
      };
    } catch (error) {
      // Diferenciamos los errores conocidos (Dominio inválido, falta de payload) de caídas de base de datos
      if (error instanceof UnauthorizedException) {
        throw error; 
      }
      
      // Si el error proviene de la librería de Google por token corrupto o expirado
      if (error instanceof Error && (error.message.includes('Token used too late') || error.message.includes('Wrong number of segments'))) {
        throw new UnauthorizedException('El token de Google proporcionado es inválido o ha expirado.');
      }

      // Si llegamos aquí, Prisma explotó o no hay conexión a Supabase
      console.error('Error interno en verifyGoogleToken:', error);
      throw new InternalServerErrorException('Error interno al procesar la autenticación. Contacte soporte.');
    }
  }
}