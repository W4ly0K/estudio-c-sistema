import { Prisma, CategoriaSolicitud } from '@prisma/client';
import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';
import { PrismaService } from '../prisma/prisma.service';
import { NotImplementedException } from '@nestjs/common';

@Injectable()
export class SolicitudesService {
  constructor(private prisma: PrismaService) {}

  // 1. Añadimos idUsuario: string para recibirlo de forma segura desde el controlador
  async create(createSolicitudeDto: CreateSolicitudeDto, idUsuario: string) {
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
        id_usuario: idUsuario, // <-- Usamos el ID seguro extraído del Token JWT
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
  // ... (tu método create actual)

  // NUEVO MÉTODO: Consulta las solicitudes filtrando estrictamente por el ID del usuario
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
        fecha_inicio: 'desc', // Ordenamos de más reciente a más antigua
      },
    });
  }

  // ... (tu método findAll actual)
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
            recurso: true, // Trae nombre y cantidad_total del inventario para C3
          },
        },
        logs: {
          orderBy: { fecha_modificacion: 'asc' }, // Orden cronológico para C7
        },
      },
    });

    if (!solicitud) {
      throw new BadRequestException(`El radicado ${radicado} no existe en el sistema.`);
    }

    return solicitud;
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
          // Ya no intentamos actualizar el id_usuario, bloqueando el cambio de dueño
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

  async remove(radicado: string) {
    // Verificar si existe antes de decidir política o bloquear borrado físico inmutable
    const existe = await this.prisma.solicitud.findUnique({ where: { radicado } });
    if (!existe) {
      throw new BadRequestException(`El radicado ${radicado} no existe.`);
    }

    // Regla de arquitectura financiera/auditoría: los radicados no se eliminan físicamente.
    throw new NotImplementedException(
      'El borrado físico de radicados está prohibido por política de auditoría. Use PATCH para cambiar estado a cancelación.'
    );
  }
}