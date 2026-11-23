import { Module } from '@nestjs/common';
import { SolicitudesService } from './solicitudes.service';
import { SolicitudesController } from './solicitudes.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { Reloj, RelojDelSistema } from '../common/reloj/reloj';

@Module({
  imports: [
    PrismaModule, 
    AuthModule // <-- IMPORTANTE: Solo AuthModule, sin PassportModule aquí
  ], 
  controllers: [SolicitudesController],
  // Decisión D-U: el Reloj se inyecta; las pruebas lo sustituyen por RelojFijo.
  providers: [SolicitudesService, { provide: Reloj, useClass: RelojDelSistema }],
})
export class SolicitudesModule {}