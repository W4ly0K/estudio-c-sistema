import { Injectable, UnauthorizedException, InternalServerErrorException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import type { PerfilUsuario } from './interfaces/perfil-usuario.interface';

/** Lista blanca de columnas del perfil (Fase 6.2 · DS1): el correo no sale. */
export const SELECT_PERFIL = {
  id_usuario: true,
  nombre: true,
  rol: true,
} as const satisfies Prisma.UsuarioSelect;

/** El mismo texto que JwtStrategy: el usuario del token ya no existe. */
export const MENSAJE_PERFIL_SIN_USUARIO = 'La sesión no corresponde a un usuario vigente.';

/** Única traducción de la fila al perfil público: la usan el login y GET /auth/perfil. */
function perfilDe(usuario: Prisma.UsuarioGetPayload<{ select: typeof SELECT_PERFIL }>): PerfilUsuario {
  return { id: usuario.id_usuario, nombre: usuario.nombre, rol: usuario.rol };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
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
      const jwtPayload: JwtPayload = { sub: usuario.id_usuario, correo: usuario.correo, rol: usuario.rol };
      const backendToken = this.jwtService.sign(jwtPayload);

      return {
        mensaje: 'Autenticación exitosa',
        token: backendToken,
        usuario: perfilDe(usuario),
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
      this.logger.error(
        'Error interno en verifyGoogleToken',
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al procesar la autenticación. Contacte soporte.');
    }
  }

  /**
   * Fase 6.2 · DS1: GET /auth/perfil. Permite al frontend restaurar la sesión al
   * recargar. El id llega del JWT ya verificado; nombre y rol se leen de la BD, así
   * que un cambio de rol o un usuario eliminado se reflejan de inmediato.
   */
  async obtenerPerfil(idUsuario: string): Promise<PerfilUsuario> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id_usuario: idUsuario },
      select: SELECT_PERFIL,
    });
    if (!usuario) {
      // Eliminado entre la validación del token y esta consulta: fail-closed, como JwtStrategy.
      throw new UnauthorizedException(MENSAJE_PERFIL_SIN_USUARIO);
    }
    return perfilDe(usuario);
  }
}