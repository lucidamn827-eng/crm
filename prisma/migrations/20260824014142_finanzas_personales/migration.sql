-- CreateTable
CREATE TABLE "MovimientoPersonal" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "categoria" TEXT NOT NULL,
    "nota" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoPersonal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresupuestoPersonal" (
    "categoria" TEXT NOT NULL,
    "limite" DOUBLE PRECISION NOT NULL,
    "color" TEXT,

    CONSTRAINT "PresupuestoPersonal_pkey" PRIMARY KEY ("categoria")
);

-- CreateTable
CREATE TABLE "AjustePersonal" (
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "AjustePersonal_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE INDEX "MovimientoPersonal_fecha_idx" ON "MovimientoPersonal"("fecha");

-- CreateIndex
CREATE INDEX "MovimientoPersonal_tipo_categoria_idx" ON "MovimientoPersonal"("tipo", "categoria");
