-- CreateIndex
CREATE INDEX "Lead_cargadoPorId_creadoEn_idx" ON "Lead"("cargadoPorId", "creadoEn");

-- CreateIndex
CREATE INDEX "Llamada_resultado_anulada_creadoEn_idx" ON "Llamada"("resultado", "anulada", "creadoEn");
