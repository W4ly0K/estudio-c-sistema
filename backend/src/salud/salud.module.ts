import { Module } from '@nestjs/common';
import { SaludController } from './salud.controller';

/** Módulo aislado: no importa PrismaModule a propósito (la sonda no toca la BD). */
@Module({
  controllers: [SaludController],
})
export class SaludModule {}
