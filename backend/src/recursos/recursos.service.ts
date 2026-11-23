import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRecursoDto } from './dto/create-recurso.dto';
import { UpdateRecursoDto } from './dto/update-recurso.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RecursosService {
  // Inyectamos nuestro puente a la base de datos
  constructor(private prisma: PrismaService) {}

  async create(createRecursoDto: CreateRecursoDto) {
    return await this.prisma.recurso.create({
      data: createRecursoDto,
    });
  }

  async findAll() {
    return await this.prisma.recurso.findMany();
  }

  // Implementación real consultando Supabase
  async findOne(id: number) {
    const recurso = await this.prisma.recurso.findUnique({
      where: { id_recurso: id },
    });

    if (!recurso) {
      throw new NotFoundException(`El recurso con ID ${id} no existe en el inventario.`);
    }

    return recurso;
  }

  // Implementación real de update
  async update(id: number, updateRecursoDto: UpdateRecursoDto) {
    await this.findOne(id); // Validamos existencia previa

    return await this.prisma.recurso.update({
      where: { id_recurso: id },
      data: updateRecursoDto,
    });
  }

  // Implementación real de remove
  async remove(id: number) {
    await this.findOne(id); // Validamos existencia previa

    return await this.prisma.recurso.delete({
      where: { id_recurso: id },
    });
  }
}