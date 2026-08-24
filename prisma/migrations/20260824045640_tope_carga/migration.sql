-- CreateTable
CREATE TABLE "TopeCarga" (
    "id" SERIAL NOT NULL,
    "callerId" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "tope" INTEGER NOT NULL,
    "puestoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopeCarga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCarga" (
    "id" SERIAL NOT NULL,
    "callerId" TEXT NOT NULL,
    "spamerId" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltoEn" TIMESTAMP(3),

    CONSTRAINT "PedidoCarga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TopeCarga_callerId_dia_key" ON "TopeCarga"("callerId", "dia");

-- CreateIndex
CREATE INDEX "PedidoCarga_estado_idx" ON "PedidoCarga"("estado");
