BEGIN;

-- Add shop location ownership to existing service bays.
ALTER TABLE "ServiceBay"
ADD COLUMN "shopLocationId" TEXT;

-- Backfill existing service bays to the organization's
-- active default shop location.
UPDATE "ServiceBay" AS sb
SET "shopLocationId" = sl."id"
FROM "ShopLocation" AS sl
WHERE sl."organizationId" = sb."organizationId"
  AND sl."isDefault" = true
  AND sl."status" = 'ACTIVE'
  AND sb."shopLocationId" IS NULL;

-- Prevent migration completion if any service bay
-- could not be assigned to a valid default shop.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "ServiceBay"
        WHERE "shopLocationId" IS NULL
    ) THEN
        RAISE EXCEPTION
            'Service bay backfill failed: missing active default shop location.';
    END IF;
END $$;

-- Create location-scoped lookup index.
CREATE INDEX "ServiceBay_organizationId_shopLocationId_idx"
ON "ServiceBay"("organizationId", "shopLocationId");

-- Enforce organization and location ownership.
ALTER TABLE "ServiceBay"
ADD CONSTRAINT "ServiceBay_organizationId_shopLocationId_fkey"
FOREIGN KEY ("organizationId", "shopLocationId")
REFERENCES "ShopLocation"("organizationId", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

COMMIT;