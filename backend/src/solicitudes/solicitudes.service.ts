import { Prisma, CategoriaSolicitud, Solicitud } from '@prisma/client';
import { Injectable, BadRequestException, NotImplementedException } from '@nestjs/common';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SolicitudesService {
  constructor(private prisma: PrismaService) {}

  async create(createSolicitudeDto: CreateSolicitudeDto, idUsuario: string) {
    // --- 1. Mitigación M3: Validación Anti-Traslape (CA-06) ---
    const conflicto = await this.prisma.solicitud.findFirst({
      where: {
        estado: { notIn: ['Rechazado', 'Cancelado por el Usuario'] },
        AND: [
          { fecha_inicio: { lt: createSolicitudeDto.fecha_fin } },
          { fecha_fin: { gt: createSolicitudeDto.fecha_inicio } },
        ],
      },
    });

    if (conflicto) {
      throw new BadRequestException(
        `Error CA-06: Horario en conflicto con la solicitud ${conflicto.radicado}. Envío bloqueado.`
      );
    }

    // --- 2. Mitigación CA-04: Bloqueo de horario de almuerzo (12:00 a 14:00) ---
    const getDecimalHour = (date: Date) => date.getHours() + date.getMinutes() / 60;
    const horaInicio = getDecimalHour(createSolicitudeDto.fecha_inicio);
    const horaFin = getDecimalHour(createSolicitudeDto.fecha_fin);

    // Si la reserva empieza antes de las 14:00 y termina después de las 12:00, se cruza con el almuerzo
    if (horaInicio < 14 && horaFin > 12) {
      throw new BadRequestException(
        'Error CA-04: El sistema no permite programar radicados durante el horario de almuerzo institucional (12:00 a 14:00).'
      );
    }

    // --- 3. Lógica de Fechas (Urgencia) ---
    const hoy = new Date();
    const fechaReserva = createSolicitudeDto.fecha_inicio;
    const diferenciaMilisegundos = fechaReserva.getTime() - hoy.getTime();
    const diferenciaDias = Math.ceil(diferenciaMilisegundos / (1000 * 60 * 60 * 24));
    const esUrgencia = diferenciaDias < 5;

    // --- 4. Generar Radicado ---
    const radicadoGenerado = `EC-${hoy.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // --- 5. Persistencia con Relaciones Anidadas ---
    return await this.prisma.solicitud.create({
      data: {
        radicado: radicadoGenerado,
        id_usuario: idUsuario,
        categoria: createSolicitudeDto.categoria as CategoriaSolicitud,
        proposito: createSolicitudeDto.proposito,
        fecha_inicio: createSolicitudeDto.fecha_inicio,
        fecha_fin: createSolicitudeDto.fecha_fin,
        estado: 'Recibido',
        es_urgencia: esUrgencia,
        
        recursos: { 
          create: createSolicitudeDto.recursos?.map(recurso => ({
            id_recurso: recurso.id_recurso,
            cantidad_solicitada: recurso.cantidad
          })) || []
        }
      },
    });
  }

  async findMisSolicitudes(idUsuario: string) {
    return await this.prisma.solicitud.findMany({
      where: {
        id_usuario: idUsuario,
      },
      include: {
        recursos: {
          include: {
            recurso: {
              select: { nombre: true },
            },
          },
        },
      },
      orderBy: {
        fecha_inicio: 'desc', 
      },
    });
  }

  async findAll(estado?: string, categoria?: CategoriaSolicitud) {
    return await this.prisma.solicitud.findMany({
      where: {
        ...(estado ? { estado } : {}),
        ...(categoria ? { categoria } : {}),
      },
      include: {
        usuario: {
          select: { nombre: true, correo: true },
        },
        recursos: {
          include: {
            recurso: {
              select: { nombre: true },
            },
          },
        },
      },
      orderBy: {
        fecha_inicio: 'asc',
      },
    });
  }

  async findOne(radicado: string) {
    const solicitud = await this.prisma.solicitud.findUnique({
      where: { radicado },
      include: {
        usuario: {
          select: { id_usuario: true, nombre: true, correo: true, rol: true },
        },
        recursos: {
          include: {
            recurso: true, 
          },
        },
        logs: {
          orderBy: { fecha_modificacion: 'asc' }, 
        },
      },
    });

    if (!solicitud) {
      throw new BadRequestException(`El radicado ${radicado} no existe en el sistema.`);
    }

    return solicitud;
  }

  async update(
    radicado: string,
    updateSolicitudeDto: UpdateSolicitudeDto,
    idStaff: string,
  ): Promise<{ mensaje: string; solicitud: Solicitud }> {
    const solicitudExistente = await this.prisma.solicitud.findUnique({
      where: { radicado }
    });

    if (!solicitudExistente) {
      throw new BadRequestException(`El radicado ${radicado} no existe en el sistema.`);
    }

    if (!updateSolicitudeDto.estado || solicitudExistente.estado === updateSolicitudeDto.estado) {
      const { motivo_rechazo, recursos, ...datosParaActualizar } = updateSolicitudeDto;

      const solicitudActualizada = await this.prisma.solicitud.update({
        where: { radicado },
        data: {
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

    const [solicitudActualizada, logAuditoria] = await this.prisma.$transaction([
      this.prisma.solicitud.update({
        where: { radicado },
        data: { estado: updateSolicitudeDto.estado }
      }),
      this.prisma.log_Auditoria.create({
        data: {
          radicado_solicitud: radicado,
          estado_anterior: solicitudExistente.estado,
          estado_nuevo: updateSolicitudeDto.estado,
          modificado_por: idStaff, // Zero Trust: autor tomado del JWT verificado, nunca del body
          motivo_rechazo: updateSolicitudeDto.motivo_rechazo
        }
      })
    ]);

    return {
      mensaje: "Estado actualizado y auditado correctamente en la bitácora",
      solicitud: solicitudActualizada
    };
  }

  async remove(radicado: string) {
    const existe = await this.prisma.solicitud.findUnique({ where: { radicado } });
    if (!existe) {
      throw new BadRequestException(`El radicado ${radicado} no existe.`);
    }

    throw new NotImplementedException(
      'El borrado físico de radicados está prohibido por política de auditoría. Use PATCH para cambiar estado a cancelación.'
    );
  }
}