import { Module } from '@nestjs/common';
import { SolicitudesService } from './solicitudes.service';
import { SolicitudesController } from './solicitudes.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module'; 

@Module({
  imports: [
    PrismaModule, 
    AuthModule // <-- IMPORTANTE: Solo AuthModule, sin PassportModule aquí
  ], 
  controllers: [SolicitudesController],
  providers: [SolicitudesService],
})
export class SolicitudesModule {}