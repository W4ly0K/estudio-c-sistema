import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SolicitudesService {
  constructor(private prisma: PrismaService) {}

  async create(createSolicitudeDto: CreateSolicitudeDto) {
    // --- 1. Mitigación M3: Validación Anti-Traslape (CA-06) ---
    const conflicto = await this.prisma.solicitud.findFirst({
      where: {
        // Ignoramos las solicitudes que ya fueron canceladas o rechazadas
        estado: { notIn: ['Rechazado', 'Cancelado por el Usuario'] },
        // Lógica de colisión de tiempo en Prisma
        AND: [
          { fecha_inicio: { lt: createSolicitudeDto.fecha_fin } },
          { fecha_fin: { gt: createSolicitudeDto.fecha_inicio } },
        ],
      },
    });

    // Si Prisma encuentra un conflicto, disparamos el escudo de NestJS
    if (conflicto) {
      throw new BadRequestException(
        `Error CA-06: Horario en conflicto con la solicitud ${conflicto.radicado}. Envío bloqueado.`
      );
    }

    // --- 2. Lógica de Fechas (Urgencia) ---
    const hoy = new Date();
    const fechaReserva = createSolicitudeDto.fecha_inicio;
    const diferenciaMilisegundos = fechaReserva.getTime() - hoy.getTime();
    const diferenciaDias = Math.ceil(diferenciaMilisegundos / (1000 * 60 * 60 * 24));
    const esUrgencia = diferenciaDias < 5;

    // --- 3. Generar Radicado ---
    const radicadoGenerado = `EC-${hoy.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // --- 4. Persistencia ---
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

  findOne(id: number) {
    return `This action returns a #${id} solicitude`;
  }

// Nota: Cambiamos 'id: number' por 'radicado: string' porque es la llave primaria
  async update(radicado: string, updateSolicitudeDto: UpdateSolicitudeDto) {
    // 1. Verificamos que la solicitud exista
    const solicitudExistente = await this.prisma.solicitud.findUnique({
      where: { radicado }
    });

    if (!solicitudExistente) {
      throw new BadRequestException(`El radicado ${radicado} no existe en el sistema.`);
    }

    // 2. Ejecutamos la actualización
    const solicitudActualizada = await this.prisma.solicitud.update({
      where: { radicado },
      data: {
        estado: updateSolicitudeDto.estado,
      }
    });

    // 3. (Opcional - Próximo paso) Aquí insertaremos el registro en Log_Auditoria

    return solicitudActualizada;
  }

  remove(id: number) {
    return `This action removes a #${id} solicitude`;
  }
}
