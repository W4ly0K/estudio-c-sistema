import { Prisma, CategoriaSolicitud } from '@prisma/client';
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

    // --- 4. Persistencia con Relaciones Anidadas ---
    return await this.prisma.solicitud.create({
      data: {
        radicado: radicadoGenerado,
        id_usuario: createSolicitudeDto.id_usuario,
        categoria: createSolicitudeDto.categoria as CategoriaSolicitud,
        proposito: createSolicitudeDto.proposito,
        fecha_inicio: createSolicitudeDto.fecha_inicio,
        fecha_fin: createSolicitudeDto.fecha_fin,
        estado: 'Recibido',
        es_urgencia: esUrgencia,
        
        // Magia de Prisma: Insertar en la tabla intermedia de un solo golpe
        // IMPORTANTE: Prisma suele nombrar la relación en camelCase o igual a tu modelo. 
        // Revisa tu schema.prisma. Puede ser 'solicitud_recurso' o 'Solicitud_Recurso'.
        Solicitud_Recurso: { 
          create: createSolicitudeDto.recursos?.map(recurso => ({
            id_recurso: recurso.id_recurso,
            cantidad: recurso.cantidad
          })) || []
        }
      },
    });
  }

  async findAll() {
    return await this.prisma.solicitud.findMany();
  }

  findOne(id: number) {
    return `This action returns a #${id} solicitude`;
  }


  async update(radicado: string, updateSolicitudeDto: UpdateSolicitudeDto) {
    // 1. Verificamos que la solicitud exista y capturamos su estado_anterior
    const solicitudExistente = await this.prisma.solicitud.findUnique({
      where: { radicado }
    });

    if (!solicitudExistente) {
      throw new BadRequestException(`El radicado ${radicado} no existe en el sistema.`);
    }

    // Si el cliente no está intentando cambiar el estado, hacemos un update normal
    if (!updateSolicitudeDto.estado || solicitudExistente.estado === updateSolicitudeDto.estado) {
      const { motivo_rechazo, modificado_por, recursos, ...datosParaActualizar } = updateSolicitudeDto;

      const solicitudActualizada = await this.prisma.solicitud.update({
        where: { radicado },
        data: {
          ...(datosParaActualizar.id_usuario ? { id_usuario: datosParaActualizar.id_usuario } : {}),
          ...(datosParaActualizar.categoria ? { categoria: datosParaActualizar.categoria as CategoriaSolicitud } : {}),
          ...(datosParaActualizar.proposito ? { proposito: datosParaActualizar.proposito } : {}),
          ...(datosParaActualizar.fecha_inicio ? { fecha_inicio: datosParaActualizar.fecha_inicio } : {}),
          ...(datosParaActualizar.fecha_fin ? { fecha_fin: datosParaActualizar.fecha_fin } : {}),
          ...(recursos
            ? {
                recursos: {
                  deleteMany: {},
                  create: recursos.map((r) => ({
                    id_recurso: r.id_recurso,
                    cantidad_solicitada: r.cantidad,
                  })),
                },
              }
            : {}),
        },
      });

      return {
        mensaje: 'Solicitud actualizada correctamente (sin cambio de estado)',
        solicitud: solicitudActualizada,
      };
    }

    // 2. Si HAY un cambio de estado, disparamos una Transacción Atómica
    const [solicitudActualizada, logAuditoria] = await this.prisma.$transaction([
      
      // Operación A: Actualizar el estado de la solicitud
      this.prisma.solicitud.update({
        where: { radicado },
        data: { estado: updateSolicitudeDto.estado }
      }),

      // Operación B: Escribir el registro inmutable en la bitácora
      this.prisma.log_Auditoria.create({
        data: {
          radicado_solicitud: radicado,
          estado_anterior: solicitudExistente.estado,
          estado_nuevo: updateSolicitudeDto.estado,
          modificado_por: updateSolicitudeDto.modificado_por || '1085000000', 
          motivo_rechazo: updateSolicitudeDto.motivo_rechazo
        }
      })
      
    ]);

    return {
      mensaje: "Estado actualizado y auditado correctamente en la bitácora",
      solicitud: solicitudActualizada
    };
  }

  remove(id: number) {
    return `This action removes a #${id} solicitude`;
  }
}
