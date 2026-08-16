/*
  Warnings:

  - You are about to drop the column `ciudad` on the `Lead` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "ciudad";

-- AlterTable
ALTER TABLE "Llamada" ADD COLUMN     "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "agente" TEXT,
ADD COLUMN     "desdeIp" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "ultimoLatido" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Evento" (
    "id" SERIAL NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "leadId" INTEGER,
    "detalle" TEXT,
    "segundos" INTEGER,
    "ip" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Evento_usuarioId_creadoEn_idx" ON "Evento"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "Evento_tipo_creadoEn_idx" ON "Evento"("tipo", "creadoEn");

-- CreateIndex
CREATE INDEX "Llamada_callerId_creadoEn_idx" ON "Llamada"("callerId", "creadoEn");

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
