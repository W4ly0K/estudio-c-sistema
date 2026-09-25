import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

// Definimos el contrato estricto para eliminar el 'any'
export interface JwtPayload {
  sub: string;
  correo: string;
  rol: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
      throw new Error('FATAL ERROR: JWT_SECRET no está configurado en el archivo .env');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret, 
    });
  }

  // Usamos la interfaz en lugar de 'any'
  async validate(payload: JwtPayload) {
    return { id: payload.sub, correo: payload.correo, rol: payload.rol };
  }
}