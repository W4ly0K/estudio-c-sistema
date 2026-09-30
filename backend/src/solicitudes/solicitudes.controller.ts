import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CategoriaSolicitud, RolUsuario } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import type { UsuarioAutenticado } from '../auth/interfaces/usuario-autenticado.interface';
import { SolicitudesService } from './solicitudes.service';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';

// Autenticación: APP_GUARD global. Autorización: @Roles por endpoint.
@Controller('solicitudes')
export class SolicitudesController {
  constructor(private readonly solicitudesService: SolicitudesService) {}

  @Post()
  create(@Body() dto: CreateSolicitudeDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.solicitudesService.create(dto, usuario.id);
  }

  // ⚠️ Debe declararse ANTES de ':radicado': Express evalúa las rutas en orden de
  // declaración y ':radicado' capturaría "mis-solicitudes" como si fuera un radicado.
  @Get('mis-solicitudes')
  findMisSolicitudes(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.solicitudesService.findMisSolicitudes(usuario.id);
  }

  @Roles(RolUsuario.STAFF)
  @Get()
  findAll(@Query('estado') estado?: string, @Query('categoria') categoria?: CategoriaSolicitud) {
    return this.solicitudesService.findAll(estado, categoria);
  }

  @Roles(RolUsuario.STAFF) // Temporal: se abre al dueño en el paso 2.2
  @Get(':radicado')
  findOne(@Param('radicado') radicado: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.solicitudesService.findOne(radicado, usuario);
  }

  @Roles(RolUsuario.STAFF)
  @Patch(':radicado')
  update(
    @Param('radicado') radicado: string,
    @Body() dto: UpdateSolicitudeDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudesService.update(radicado, dto, usuario.id);
  }

  @Roles(RolUsuario.STAFF)
  @Delete(':radicado')
  remove(@Param('radicado') radicado: string) {
    return this.solicitudesService.remove(radicado);
  }
}
