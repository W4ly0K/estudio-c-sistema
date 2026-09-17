import { Injectable } from '@nestjs/common';
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

  findOne(id: number) {
    return `This action returns a #${id} recurso`;
  }

  update(id: number, updateRecursoDto: UpdateRecursoDto) {
    return `This action updates a #${id} recurso`;
  }

  remove(id: number) {
    return `This action removes a #${id} recurso`;
  }
}