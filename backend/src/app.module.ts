import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { RecursosModule } from './recursos/recursos.module';
import { SolicitudesModule } from './solicitudes/solicitudes.module';

@Module({
  imports: [PrismaModule, UsuariosModule, RecursosModule, SolicitudesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
