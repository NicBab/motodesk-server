-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "actualCost" DECIMAL(12,2),
ADD COLUMN     "backorderedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "binLocation" TEXT,
ADD COLUMN     "damagedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "packingSlip" TEXT;
