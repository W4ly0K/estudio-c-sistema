import { Module } from '@nestjs/common';
import { RecursosService } from './recursos.service';
import { RecursosController } from './recursos.controller';
// 1. Importamos el AuthModule
import { AuthModule } from '../auth/auth.module'; 

@Module({
  // 2. Lo añadimos al arreglo de imports
  imports: [AuthModule], 
  controllers: [RecursosController],
  providers: [RecursosService],
})
export class RecursosModule {}