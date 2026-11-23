import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { RecursosService } from './recursos.service';
import { CreateRecursoDto } from './dto/create-recurso.dto';
import { UpdateRecursoDto } from './dto/update-recurso.dto';
import { Roles } from '../auth/decorators/roles.decorator';

// Lectura: cualquier usuario autenticado (catálogo del formulario B2).
// Escritura: exclusiva del Staff (inventario, PRD §7).
@Controller('recursos')
export class RecursosController {
  constructor(private readonly recursosService: RecursosService) {}

  @Roles(RolUsuario.STAFF)
  @Post()
  create(@Body() createRecursoDto: CreateRecursoDto) {
    return this.recursosService.create(createRecursoDto);
  }

  @Get()
  findAll() {
    return this.recursosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.recursosService.findOne(+id); // Aquí SÍ se mantiene el "+" porque id_recurso es Int
  }

  @Roles(RolUsuario.STAFF)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRecursoDto: UpdateRecursoDto) {
    return this.recursosService.update(+id, updateRecursoDto); 
  }

  @Roles(RolUsuario.STAFF)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.recursosService.remove(+id); 
  }
}