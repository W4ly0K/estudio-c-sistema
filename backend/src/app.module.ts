import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { RecursosModule } from './recursos/recursos.module';
import { SolicitudesModule } from './solicitudes/solicitudes.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [PrismaModule, UsuariosModule, RecursosModule, SolicitudesModule, AuthModule],
  controllers: [AppController],
  providers: [
    AppService,
    // Denegar por defecto: el ORDEN importa (1º identidad, 2º rol)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
