import { Injectable } from '@nestjs/common';
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

  // Dejaremos estos tres por defecto para el siguiente paso
  findOne(id: number) {
    return `This action returns a #${id} usuario`;
  }

  update(id: number, updateUsuarioDto: UpdateUsuarioDto) {
    return `This action updates a #${id} usuario`;
  }

  remove(id: number) {
    return `This action removes a #${id} usuario`;
  }
}