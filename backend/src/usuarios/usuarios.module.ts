import { Module } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
// 1. Importamos el AuthModule
import { AuthModule } from '../auth/auth.module'; 

@Module({
  // 2. Lo añadimos al arreglo de imports
  imports: [AuthModule], 
  controllers: [UsuariosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}