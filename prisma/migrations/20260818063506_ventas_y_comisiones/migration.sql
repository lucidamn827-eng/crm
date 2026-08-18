-- AlterTable
ALTER TABLE "Llamada" ADD COLUMN     "anulada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monto" DOUBLE PRECISION,
ADD COLUMN     "referencia" TEXT,
ADD COLUMN     "revisadoEn" TIMESTAMP(3),
ADD COLUMN     "revisadoPor" TEXT,
ADD COLUMN     "validada" BOOLEAN NOT NULL DEFAULT false;
