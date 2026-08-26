-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxId" TEXT;

-- CreateIndex
CREATE INDEX "Customer_organizationId_taxId_idx" ON "Customer"("organizationId", "taxId");
