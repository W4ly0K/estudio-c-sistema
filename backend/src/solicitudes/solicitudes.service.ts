import { Injectable } from '@nestjs/common';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SolicitudesService {
  constructor(private prisma: PrismaService) {}

  async create(createSolicitudeDto: CreateSolicitudeDto) {
    const hoy = new Date();
    const fechaReserva = createSolicitudeDto.fecha_inicio;
    
    const diferenciaMilisegundos = fechaReserva.getTime() - hoy.getTime();
    const diferenciaDias = Math.ceil(diferenciaMilisegundos / (1000 * 60 * 60 * 24));
    const esUrgencia = diferenciaDias < 5;

    const radicadoGenerado = `EC-${hoy.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    return await this.prisma.solicitud.create({
      data: {
        radicado: radicadoGenerado,
        id_usuario: createSolicitudeDto.id_usuario,
        categoria: createSolicitudeDto.categoria as any,
        proposito: createSolicitudeDto.proposito,
        fecha_inicio: createSolicitudeDto.fecha_inicio,
        fecha_fin: createSolicitudeDto.fecha_fin,
        estado: 'Recibido',
        es_urgencia: esUrgencia,
      },
    });
  }

  async findAll() {
    return await this.prisma.solicitud.findMany();
  }

  // --- Métodos restaurados para evitar errores en el controlador ---
  findOne(id: number) {
    return `This action returns a #${id} solicitude`;
  }

  update(id: number, updateSolicitudeDto: UpdateSolicitudeDto) {
    return `This action updates a #${id} solicitude`;
  }

  remove(id: number) {
    return `This action removes a #${id} solicitude`;
  }
}