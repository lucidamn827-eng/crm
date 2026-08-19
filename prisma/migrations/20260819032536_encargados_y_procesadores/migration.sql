-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Rol" ADD VALUE 'ENCARGADO';
ALTER TYPE "Rol" ADD VALUE 'PROCESADOR';

-- AlterTable
ALTER TABLE "Llamada" ADD COLUMN     "procesadorId" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "encargadoId" TEXT;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_encargadoId_fkey" FOREIGN KEY ("encargadoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Llamada" ADD CONSTRAINT "Llamada_procesadorId_fkey" FOREIGN KEY ("procesadorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
