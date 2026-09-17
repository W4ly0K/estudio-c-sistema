import { Module } from '@nestjs/common';
import { SolicitudesService } from './solicitudes.service';
import { SolicitudesController } from './solicitudes.controller';

@Module({
  controllers: [SolicitudesController],
  providers: [SolicitudesService],
})
export class SolicitudesModule {}
