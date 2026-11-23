-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('SOLICITANTE', 'STAFF');

-- CreateEnum
CREATE TYPE "CategoriaSolicitud" AS ENUM ('PODCAST', 'VIDEO', 'ESPACIOS', 'STREAMING', 'ASESORIAS');

-- CreateTable
CREATE TABLE "Usuario" (
    "id_usuario" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'SOLICITANTE',

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "Solicitud" (
    "radicado" TEXT NOT NULL,
    "id_usuario" TEXT NOT NULL,
    "categoria" "CategoriaSolicitud" NOT NULL,
    "proposito" TEXT NOT NULL,
    "num_participantes" INTEGER,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "fecha_propuesta_inicio" TIMESTAMP(3),
    "fecha_propuesta_fin" TIMESTAMP(3),
    "estado" TEXT NOT NULL,
    "es_urgencia" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Solicitud_pkey" PRIMARY KEY ("radicado")
);

-- CreateTable
CREATE TABLE "Recurso" (
    "id_recurso" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad_total" INTEGER NOT NULL,

    CONSTRAINT "Recurso_pkey" PRIMARY KEY ("id_recurso")
);

-- CreateTable
CREATE TABLE "Solicitud_Recurso" (
    "id_detalle" TEXT NOT NULL,
    "radicado_solicitud" TEXT NOT NULL,
    "id_recurso" INTEGER NOT NULL,
    "cantidad_solicitada" INTEGER NOT NULL,

    CONSTRAINT "Solicitud_Recurso_pkey" PRIMARY KEY ("id_detalle")
);

-- CreateTable
CREATE TABLE "Log_Auditoria" (
    "id_log" TEXT NOT NULL,
    "radicado_solicitud" TEXT NOT NULL,
    "estado_anterior" TEXT NOT NULL,
    "estado_nuevo" TEXT NOT NULL,
    "modificado_por" TEXT NOT NULL,
    "fecha_modificacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo_rechazo" TEXT,

    CONSTRAINT "Log_Auditoria_pkey" PRIMARY KEY ("id_log")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_correo_key" ON "Usuario"("correo");

-- AddForeignKey
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitud_Recurso" ADD CONSTRAINT "Solicitud_Recurso_radicado_solicitud_fkey" FOREIGN KEY ("radicado_solicitud") REFERENCES "Solicitud"("radicado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitud_Recurso" ADD CONSTRAINT "Solicitud_Recurso_id_recurso_fkey" FOREIGN KEY ("id_recurso") REFERENCES "Recurso"("id_recurso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log_Auditoria" ADD CONSTRAINT "Log_Auditoria_radicado_solicitud_fkey" FOREIGN KEY ("radicado_solicitud") REFERENCES "Solicitud"("radicado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log_Auditoria" ADD CONSTRAINT "Log_Auditoria_modificado_por_fkey" FOREIGN KEY ("modificado_por") REFERENCES "Usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

