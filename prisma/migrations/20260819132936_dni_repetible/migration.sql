-- DropIndex
DROP INDEX "Lead_dni_key";

-- CreateIndex
CREATE INDEX "Lead_dni_idx" ON "Lead"("dni");
