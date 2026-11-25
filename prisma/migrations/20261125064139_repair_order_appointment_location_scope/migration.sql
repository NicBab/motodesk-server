BEGIN;

-- AlterTable
ALTER TABLE "RepairOrder"
ADD COLUMN "shopLocationId" TEXT;

-- AlterTable
ALTER TABLE "ServiceAppointment"
ADD COLUMN "shopLocationId" TEXT;

-- Backfill existing repair orders
UPDATE "RepairOrder" AS ro
SET "shopLocationId" = sl."id"
FROM "ShopLocation" AS sl
WHERE sl."organizationId" = ro."organizationId"
  AND sl."isDefault" = TRUE
  AND sl."status" = 'ACTIVE'
  AND ro."shopLocationId" IS NULL;

-- Backfill existing service appointments
UPDATE "ServiceAppointment" AS sa
SET "shopLocationId" = sl."id"
FROM "ShopLocation" AS sl
WHERE sl."organizationId" = sa."organizationId"
  AND sl."isDefault" = TRUE
  AND sl."status" = 'ACTIVE'
  AND sa."shopLocationId" IS NULL;

-- CreateIndex
CREATE INDEX "RepairOrder_organizationId_shopLocationId_idx"
ON "RepairOrder"("organizationId", "shopLocationId");

-- CreateIndex
CREATE INDEX "ServiceAppointment_organizationId_shopLocationId_idx"
ON "ServiceAppointment"("organizationId", "shopLocationId");

-- AddForeignKey
ALTER TABLE "RepairOrder"
ADD CONSTRAINT "RepairOrder_organizationId_shopLocationId_fkey"
FOREIGN KEY ("organizationId", "shopLocationId")
REFERENCES "ShopLocation"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAppointment"
ADD CONSTRAINT "ServiceAppointment_organizationId_shopLocationId_fkey"
FOREIGN KEY ("organizationId", "shopLocationId")
REFERENCES "ShopLocation"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;