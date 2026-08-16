-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'CARGADOR', 'CALLER');

-- CreateEnum
CREATE TYPE "EstadoLead" AS ENUM ('PENDIENTE', 'NO_CONTESTO', 'VOLVER_A_LLAMAR', 'ACEPTO', 'NO_QUISO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "hash" TEXT NOT NULL,
    "telefono" TEXT,
    "telegramId" TEXT,
    "codigoTg" TEXT,
    "notificar" BOOLEAN NOT NULL DEFAULT true,
    "ventanaHasta" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "ciudad" TEXT,
    "nota" TEXT,
    "estado" "EstadoLead" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoAviso" TIMESTAMP(3),
    "avisosHoy" INTEGER NOT NULL DEFAULT 0,
    "cargadoPorId" TEXT NOT NULL,
    "asignadoAId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Llamada" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "callerId" TEXT NOT NULL,
    "resultado" "EstadoLead" NOT NULL,
    "nota" TEXT,
    "duracion" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Llamada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aviso" (
    "id" SERIAL NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "entregado" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" SERIAL NOT NULL,
    "usuario" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "Suscripcion" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "agente" TEXT,
    "usuarioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "Usuario"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_telegramId_key" ON "Usuario"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_codigoTg_key" ON "Usuario"("codigoTg");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_telefono_key" ON "Lead"("telefono");

-- CreateIndex
CREATE INDEX "Lead_asignadoAId_estado_idx" ON "Lead"("asignadoAId", "estado");

-- CreateIndex
CREATE INDEX "Lead_proximoAviso_idx" ON "Lead"("proximoAviso");

-- CreateIndex
CREATE UNIQUE INDEX "Suscripcion_endpoint_key" ON "Suscripcion"("endpoint");

-- CreateIndex
CREATE INDEX "Suscripcion_usuarioId_idx" ON "Suscripcion"("usuarioId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_cargadoPorId_fkey" FOREIGN KEY ("cargadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_asignadoAId_fkey" FOREIGN KEY ("asignadoAId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Llamada" ADD CONSTRAINT "Llamada_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Llamada" ADD CONSTRAINT "Llamada_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aviso" ADD CONSTRAINT "Aviso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
