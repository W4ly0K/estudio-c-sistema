import { Module } from '@nestjs/common';
import { RecursosService } from './recursos.service';
import { RecursosController } from './recursos.controller';

@Module({
  controllers: [RecursosController],
  providers: [RecursosService],
})
export class RecursosModule {}
