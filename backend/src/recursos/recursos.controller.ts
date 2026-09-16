import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RecursosService } from './recursos.service';
import { CreateRecursoDto } from './dto/create-recurso.dto';
import { UpdateRecursoDto } from './dto/update-recurso.dto';

@Controller('recursos')
export class RecursosController {
  constructor(private readonly recursosService: RecursosService) {}

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
    return this.recursosService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRecursoDto: UpdateRecursoDto) {
    return this.recursosService.update(+id, updateRecursoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.recursosService.remove(+id);
  }
}
