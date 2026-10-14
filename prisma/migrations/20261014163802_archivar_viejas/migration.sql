-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "archivadoEn" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lead_archivadoEn_idx" ON "Lead"("archivadoEn");
