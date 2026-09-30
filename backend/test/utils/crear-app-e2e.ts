import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { CategoriaSolicitud, Log_Auditoria, Recurso, RolUsuario, Solicitud } from '@prisma/client';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { crearValidationPipe } from '../../src/common/pipes/crear-validation-pipe';

/**
 * Levanta el AppModule REAL (APP_GUARD globales, rutas y pipe de producción)
 * con PrismaService simulado: los e2e NUNCA tocan Supabase.
 */

export const JWT_SECRET_E2E = 'secreto-e2e-solo-pruebas';

export interface UsuarioBD {
  id_usuario: string;
  correo: string;
  rol: RolUsuario;
}

// "Base de datos" de usuarios. 'uuid-borrado' NO existe a propósito.
export const USUARIOS_BD: Readonly<Record<string, UsuarioBD>> = {
  'uuid-staff': { id_usuario: 'uuid-staff', correo: 'staff@unicesmag.edu.co', rol: RolUsuario.STAFF },
  'uuid-solicitante': {
    id_usuario: 'uuid-solicitante',
    correo: 'estudiante@unicesmag.edu.co',
    rol: RolUsuario.SOLICITANTE,
  },
  // Fue STAFF (así lo dice su token), pero en la BD ya es SOLICITANTE
  'uuid-degradado': {
    id_usuario: 'uuid-degradado',
    correo: 'exstaff@unicesmag.edu.co',
    rol: RolUsuario.SOLICITANTE,
  },
};

export const SOLICITUD_E2E: Solicitud = {
  radicado: 'EC-2099-0001',
  id_usuario: 'uuid-solicitante',
  categoria: CategoriaSolicitud.ESPACIOS,
  proposito: 'Grabación de clase magistral',
  num_participantes: null,
  fecha_inicio: new Date(2099, 0, 15, 9, 0),
  fecha_fin: new Date(2099, 0, 15, 10, 0),
  fecha_propuesta_inicio: null,
  fecha_propuesta_fin: null,
  estado: 'Recibido',
  es_urgencia: false,
};

/** Solicitud de OTRO usuario: la que el solicitante de prueba jamás debe poder leer. */
export const SOLICITUD_AJENA_E2E: Solicitud = {
  ...SOLICITUD_E2E,
  radicado: 'EC-2099-0002',
  id_usuario: 'uuid-otro',
};

const SOLICITUDES_BD: readonly Solicitud[] = [SOLICITUD_E2E, SOLICITUD_AJENA_E2E];

interface ArgsFindFirstSolicitud {
  where?: { radicado?: string; id_usuario?: string };
}

const LOG_E2E: Log_Auditoria = {
  id_log: 'uuid-log',
  radicado_solicitud: 'EC-2099-0001',
  estado_anterior: 'Recibido',
  estado_nuevo: 'Validado',
  modificado_por: 'uuid-staff',
  fecha_modificacion: new Date(),
  motivo_rechazo: null,
};

interface ArgsFindUniqueUsuario {
  where: { id_usuario: string };
}

function crearPrismaMock() {
  return {
    usuario: {
      findUnique: jest.fn(
        async (args: ArgsFindUniqueUsuario): Promise<UsuarioBD | null> =>
          USUARIOS_BD[args.where.id_usuario] ?? null,
      ),
      findMany: jest.fn(async (): Promise<UsuarioBD[]> => Object.values(USUARIOS_BD)),
    },
    recurso: {
      findMany: jest.fn(async (): Promise<Recurso[]> => []),
    },
    solicitud: {
      findMany: jest.fn(async (): Promise<Solicitud[]> => [SOLICITUD_E2E]),
      // Filtra SOLO por lo que el servicio le pide: si el servicio olvidara el filtro de
      // propiedad, devolvería la solicitud ajena y los e2e de Fase 2 fallarían.
      findFirst: jest.fn(async (args: ArgsFindFirstSolicitud): Promise<Solicitud | null> => {
        const filtro = args.where ?? {};
        if (filtro.radicado === undefined) return null; // consulta anti-traslape CA-06: sin conflictos
        return (
          SOLICITUDES_BD.find(
            (s) =>
              s.radicado === filtro.radicado &&
              (filtro.id_usuario === undefined || s.id_usuario === filtro.id_usuario),
          ) ?? null
        );
      }),
      findUnique: jest.fn(async (): Promise<Solicitud | null> => SOLICITUD_E2E),
      update: jest.fn(async (): Promise<Solicitud> => ({ ...SOLICITUD_E2E, estado: 'Validado' })),
    },
    log_Auditoria: {
      create: jest.fn(async (): Promise<Log_Auditoria> => LOG_E2E),
    },
    $transaction: jest.fn(
      async (): Promise<[Solicitud, Log_Auditoria]> => [
        { ...SOLICITUD_E2E, estado: 'Validado' },
        LOG_E2E,
      ],
    ),
  };
}

export type PrismaMockE2E = ReturnType<typeof crearPrismaMock>;

export interface ContextoE2E {
  app: INestApplication<App>;
  prisma: PrismaMockE2E;
  /** Firma un JWT válido con el JwtService REAL del módulo (mismo secreto y expiración). */
  firmar: (sub: string, rol: RolUsuario) => string;
}

export async function crearAppE2E(): Promise<ContextoE2E> {
  process.env.JWT_SECRET = JWT_SECRET_E2E;
  const prisma = crearPrismaMock();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(crearValidationPipe()); // Misma configuración que main.ts (Decisión F)
  await app.init();

  const jwt = moduleRef.get(JwtService);
  const firmar = (sub: string, rol: RolUsuario): string =>
    jwt.sign({ sub, correo: `${sub}@unicesmag.edu.co`, rol });

  return { app, prisma, firmar };
}
