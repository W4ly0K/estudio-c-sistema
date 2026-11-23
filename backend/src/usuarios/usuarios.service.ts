import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsuariosService {
  // 1. Inyectamos Prisma como nuestro puente a Supabase
  constructor(private prisma: PrismaService) {}

  // 2. Método para crear un usuario en la base de datos
  async create(createUsuarioDto: CreateUsuarioDto) {
    return await this.prisma.usuario.create({
      data: createUsuarioDto,
    });
  }

  // 3. Método para listar todos los usuarios
  async findAll() {
    return await this.prisma.usuario.findMany();
  }

  // Implementación real de findOne consultando Supabase
  async findOne(id: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id_usuario: id },
    });

    if (!usuario) {
      throw new NotFoundException(`El usuario con ID ${id} no existe en el sistema.`);
    }

    return usuario;
  }

  // Implementación real de update
  async update(id: string, updateUsuarioDto: UpdateUsuarioDto) {
    // Primero verificamos que exista usando nuestro propio método
    await this.findOne(id);

    return await this.prisma.usuario.update({
      where: { id_usuario: id },
      data: updateUsuarioDto,
    });
  }

  // Implementación real de remove
  async remove(id: string) {
    // Primero verificamos que exista antes de intentar eliminar
    await this.findOne(id);

    return await this.prisma.usuario.delete({
      where: { id_usuario: id },
    });
  }
}