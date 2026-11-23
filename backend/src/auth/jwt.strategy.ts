import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UsuarioAutenticado } from './interfaces/usuario-autenticado.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JwtStrategy.obtenerSecreto(),
      algorithms: ['HS256'],
    });
  }

  private static obtenerSecreto(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('FATAL ERROR: JWT_SECRET no está configurado en el archivo .env');
    }
    return secret;
  }

  async validate(payload: JwtPayload): Promise<UsuarioAutenticado> {
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException('Token sin identidad válida.');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id_usuario: payload.sub },
      select: { id_usuario: true, correo: true, rol: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('La sesión no corresponde a un usuario vigente.');
    }

    return { id: usuario.id_usuario, correo: usuario.correo, rol: usuario.rol };
  }
}
