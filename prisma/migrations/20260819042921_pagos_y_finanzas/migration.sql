-- CreateTable
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "concepto" TEXT,
    "metodo" TEXT,
    "referencia" TEXT,
    "lote" TEXT,
    "detalle" TEXT,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pago_usuarioId_creadoEn_idx" ON "Pago"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "Pago_lote_idx" ON "Pago"("lote");

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
