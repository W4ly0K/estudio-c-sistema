import { Prisma, CategoriaSolicitud, RolUsuario, Solicitud } from '@prisma/client';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { CreateSolicitudeDto } from './dto/create-solicitude.dto';
import { UpdateSolicitudeDto } from './dto/update-solicitude.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { UsuarioAutenticado } from '../auth/interfaces/usuario-autenticado.interface';
import { filtroDeAcceso } from './politicas/filtro-de-acceso';
import { Reloj } from '../common/reloj/reloj';
import { calendarioLaboralColombia } from './reglas/calendario-colombia';
import {
  evaluarHorario,
  MENSAJES_ERROR_HORARIO,
} from './reglas/horario.validator';
import { aMomentoLocal } from './reglas/zona-horaria';
import { esViolacionDeTraslapeCa06, MENSAJE_CA06 } from './errores/traslape-ca06';
import {
  DetalleSolicitud,
  SELECT_DETALLE_SOLICITANTE,
  SELECT_DETALLE_STAFF,
} from './proyecciones/detalle-solicitud.proyeccion';

/** Mensaje único para "no existe" y "no es tuyo" (Decisión H: anti-enumeración). */
export const MENSAJE_SOLICITUD_NO_ENCONTRADA = 'Solicitud no encontrada.';

@Injectable()
export class SolicitudesService {
  private readonly logger = new Logger(SolicitudesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  async create(createSolicitudeDto: CreateSolicitudeDto, idUsuario: string) {
    // Decisión D-U: un único "ahora" por petición. Validación, urgencia y año
    // del radicado corresponden al MISMO instante (sin carrera a medianoche).
    const ahora = this.reloj.ahora();

    // --- 1. Reglas de horario puras (Fase 3): CA-04, pasado, mismo día, día
    // hábil y urgencia por 5 días hábiles. Van ANTES de CA-06: una entrada
    // inválida se rechaza sin consultar la base de datos.
    const horario = evaluarHorario(
      {
        inicio: createSolicitudeDto.fecha_inicio,
        fin: createSolicitudeDto.fecha_fin,
      },
      ahora,
      calendarioLaboralColombia,
    );
    if (!horario.valido) {
      throw new BadRequestException(MENSAJES_ERROR_HORARIO[horario.error]);
    }

    // --- 2. Mitigación M3: Anti-Traslape (CA-06), capa amable ---
    // Consulta previa: resuelve el caso común sin llegar al motor. Minimización
    // (Fase 4): solo se pide el radicado y la respuesta no lo revela (409 único).
    const conflicto = await this.prisma.solicitud.findFirst({
      where: {
        estado: { notIn: ['Rechazado', 'Cancelado por el Usuario'] },
        AND: [
          { fecha_inicio: { lt: createSolicitudeDto.fecha_fin } },
          { fecha_fin: { gt: createSolicitudeDto.fecha_inicio } },
        ],
      },
      select: { radicado: true },
    });

    if (conflicto) {
      throw new ConflictException(MENSAJE_CA06);
    }

    // --- 3. Generar Radicado (año de Bogotá, no el del servidor) ---
    const anioRadicacion = aMomentoLocal(ahora).fecha.anio;
    const radicadoGenerado = `EC-${anioRadicacion}-${Math.floor(1000 + Math.random() * 9000)}`;

    // --- 4. Persistencia con Relaciones Anidadas ---
    // La garantía real de CA-06 es la restricción de exclusión del motor (Fase 4):
    // si otra petición ganó la carrera entre el findFirst y este INSERT, PostgreSQL
    // rechaza con 23P01 y se responde el MISMO 409. El "return await" es necesario:
    // sin await, el rechazo escaparía del try/catch.
    try {
      return await this.prisma.solicitud.create({
        data: {
          radicado: radicadoGenerado,
          id_usuario: idUsuario,
          categoria: createSolicitudeDto.categoria as CategoriaSolicitud,
          proposito: createSolicitudeDto.proposito,
          fecha_inicio: createSolicitudeDto.fecha_inicio,
          fecha_fin: createSolicitudeDto.fecha_fin,
          estado: 'Recibido',
          es_urgencia: horario.urgente,
        
          recursos: { 
            create: createSolicitudeDto.recursos?.map(recurso => ({
              id_recurso: recurso.id_recurso,
              cantidad_solicitada: recurso.cantidad
            })) || []
          }
        },
      });
    } catch (error: unknown) {
      if (esViolacionDeTraslapeCa06(error)) {
        // Métrica de concurrencia real. Solo el radicado PROPIO; nunca error.message
        // (su DETAIL contiene la franja de la otra reserva).
        this.logger.warn(
          `CA-06 resuelto por la restricción del motor (carrera concurrente): ${radicadoGenerado} no se guardó.`,
        );
        throw new ConflictException(MENSAJE_CA06);
      }
      throw error; // Fail-closed: cualquier otro error sigue su camino (500).
    }
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

  async findOne(radicado: string, usuario: UsuarioAutenticado): Promise<DetalleSolicitud> {
    // Decisión G: la propiedad se aplica DENTRO del WHERE (nunca se traen filas ajenas).
    const where: Prisma.SolicitudWhereInput = { radicado, ...filtroDeAcceso(usuario) };

    // Decisión I · fail-safe: cualquier rol distinto de STAFF recibe la proyección MÍNIMA.
    const solicitud =
      usuario.rol === RolUsuario.STAFF
        ? await this.prisma.solicitud.findFirst({ where, select: SELECT_DETALLE_STAFF })
        : await this.prisma.solicitud.findFirst({ where, select: SELECT_DETALLE_SOLICITANTE });

    // Decisión H: "no existe" y "no es tuyo" son indistinguibles (mismo código y mensaje).
    if (!solicitud) {
      throw new NotFoundException(MENSAJE_SOLICITUD_NO_ENCONTRADA);
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