-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "shopSuppliesRate" DECIMAL(5,2) NOT NULL DEFAULT 6,
ADD COLUMN     "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
