import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { Roles } from '../auth/decorators/roles.decorator';

// Gestión de usuarios: exclusiva del Staff (autenticación vía APP_GUARD global)
@Roles(RolUsuario.STAFF)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  create(@Body() createUsuarioDto: CreateUsuarioDto) {
    return this.usuariosService.create(createUsuarioDto);
  }

  @Get()
  findAll() {
    return this.usuariosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usuariosService.findOne(id); // BUG CORREGIDO: Se quitó el "+" porque el ID es UUID (string)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUsuarioDto: UpdateUsuarioDto) {
    return this.usuariosService.update(id, updateUsuarioDto); // BUG CORREGIDO
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usuariosService.remove(id); // BUG CORREGIDO
  }
}