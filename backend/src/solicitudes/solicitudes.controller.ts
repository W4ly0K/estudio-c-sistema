import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { SolicitudesService } from './solicitudes.service';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';
import { CategoriaSolicitud } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Interfaz estricta para leer el usuario del token sin usar 'any'
interface RequestConUsuario extends Request {
  user: {
    id: string;
    correo: string;
    rol: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('solicitudes')
export class SolicitudesController {
  constructor(private readonly solicitudesService: SolicitudesService) {}

  @Post()
  create(@Body() createSolicitudeDto: CreateSolicitudeDto, @Request() req: RequestConUsuario) {
    // Extraemos de forma segura el ID del token JWT verificado
    const idUsuario = req.user.id; 
    return this.solicitudesService.create(createSolicitudeDto, idUsuario);
  }

  // ... (tu método create en el controlador)

  // Ruta conectada a Prisma para cargar el historial del usuario
  @Get('mis-solicitudes')
  findMisSolicitudes(@Request() req: RequestConUsuario) {
    const idUsuario = req.user.id;
    // Ahora retornamos los datos reales de la base de datos
    return this.solicitudesService.findMisSolicitudes(idUsuario);
  }

  // ... (tu método findAll en el controlador)

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