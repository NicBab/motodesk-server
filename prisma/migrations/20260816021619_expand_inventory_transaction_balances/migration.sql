/*
  Warnings:

  - You are about to drop the column `quantityAfter` on the `PartInventoryTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `quantityBefore` on the `PartInventoryTransaction` table. All the data in the column will be lost.
  - Added the required column `allocatedAfter` to the `PartInventoryTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `allocatedBefore` to the `PartInventoryTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `onHandAfter` to the `PartInventoryTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `onHandBefore` to the `PartInventoryTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `onOrderAfter` to the `PartInventoryTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `onOrderBefore` to the `PartInventoryTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Add the new balance columns as nullable first so existing rows
-- can be migrated safely.

ALTER TABLE "PartInventoryTransaction"
ADD COLUMN "onHandBefore" DECIMAL(12,3),
ADD COLUMN "onHandAfter" DECIMAL(12,3),
ADD COLUMN "allocatedBefore" DECIMAL(12,3),
ADD COLUMN "allocatedAfter" DECIMAL(12,3),
ADD COLUMN "onOrderBefore" DECIMAL(12,3),
ADD COLUMN "onOrderAfter" DECIMAL(12,3);

-- Migrate the balance information we already tracked.
-- The old quantityBefore / quantityAfter fields represented
-- on-hand inventory.

UPDATE "PartInventoryTransaction"
SET
  "onHandBefore" = "quantityBefore",
  "onHandAfter" = "quantityAfter",
  "allocatedBefore" = 0,
  "allocatedAfter" = 0,
  "onOrderBefore" = 0,
  "onOrderAfter" = 0;

-- Now that every existing row has values, make the columns required.

ALTER TABLE "PartInventoryTransaction"
ALTER COLUMN "onHandBefore" SET NOT NULL,
ALTER COLUMN "onHandAfter" SET NOT NULL,
ALTER COLUMN "allocatedBefore" SET NOT NULL,
ALTER COLUMN "allocatedAfter" SET NOT NULL,
ALTER COLUMN "onOrderBefore" SET NOT NULL,
ALTER COLUMN "onOrderAfter" SET NOT NULL;

-- The old generic balance columns are now redundant.

ALTER TABLE "PartInventoryTransaction"
DROP COLUMN "quantityBefore",
DROP COLUMN "quantityAfter";
