import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { SolicitudesService } from './solicitudes.service';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';
import { CategoriaSolicitud } from '@prisma/client';

@Controller('solicitudes')
export class SolicitudesController {
  constructor(private readonly solicitudesService: SolicitudesService) {}

  @Post()
  create(@Body() createSolicitudeDto: CreateSolicitudeDto) {
    return this.solicitudesService.create(createSolicitudeDto);
  }

  @Get()
  findAll(
    @Query('estado') estado?: string,
    @Query('categoria') categoria?: CategoriaSolicitud,
  ) {
    return this.solicitudesService.findAll(estado, categoria);
  }

  @Get(':radicado')
  findOne(@Param('radicado') radicado: string) {
    return this.solicitudesService.findOne(radicado);
  }

  @Patch(':radicado')
  update(
    @Param('radicado') radicado: string,
    @Body() updateSolicitudeDto: UpdateSolicitudeDto,
  ) {
    return this.solicitudesService.update(radicado, updateSolicitudeDto);
  }

  @Delete(':radicado')
  remove(@Param('radicado') radicado: string) {
    return this.solicitudesService.remove(radicado);
  }
}