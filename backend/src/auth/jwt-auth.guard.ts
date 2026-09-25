import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Respetamos la firma de la clase base usando un genérico en lugar de 'any'
  handleRequest<TUser>(
    err: unknown, 
    user: TUser, 
    info: unknown, 
    context: ExecutionContext, 
    status?: unknown
  ): TUser {
    
    // Verificamos si 'info' es un Error para poder leer su mensaje de forma segura
    if (info instanceof Error) {
      console.error('🕵️ Motivo del bloqueo JWT:', info.message);
    }
    
    if (err) {
      console.error('🕵️ Error del Guard:', err);
    }
    
    if (err || !user) {
      throw err || new UnauthorizedException('Acceso denegado por JWT');
    }
    
    return user; 
  }
}