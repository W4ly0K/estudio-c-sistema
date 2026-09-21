import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    
    // Validación real: Si no hay secreto, la aplicación no debe ni siquiera arrancar.
    if (!secret) {
      throw new Error('FATAL ERROR: JWT_SECRET no está configurado en el archivo .env');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret, // <-- TypeScript ahora sabe que esto es 100% un string
    });
  }

  async validate(payload: any) {
    return { id: payload.sub, correo: payload.correo, rol: payload.rol };
  }
}