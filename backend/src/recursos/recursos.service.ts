import { Injectable } from '@nestjs/common';
import { CreateRecursoDto } from './dto/create-recurso.dto';
import { UpdateRecursoDto } from './dto/update-recurso.dto';

@Injectable()
export class RecursosService {
  create(createRecursoDto: CreateRecursoDto) {
    return 'This action adds a new recurso';
  }

  findAll() {
    return `This action returns all recursos`;
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
