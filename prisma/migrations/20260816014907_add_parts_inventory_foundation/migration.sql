-- CreateEnum
CREATE TYPE "PartInventoryTransactionType" AS ENUM ('INITIAL', 'ADJUSTMENT', 'RECEIPT', 'ALLOCATION', 'DEALLOCATION', 'ISSUE', 'RETURN', 'SALE', 'DAMAGE', 'TRANSFER', 'CYCLE_COUNT');

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "oemPartNumber" TEXT,
    "alternatePartNumbers" TEXT[],
    "description" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "qtyOnHand" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "qtyAllocated" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "qtyOnOrder" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sellPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartInventoryTransaction" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "type" "PartInventoryTransactionType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "quantityBefore" DECIMAL(12,3) NOT NULL,
    "quantityAfter" DECIMAL(12,3) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartInventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Part_organizationId_idx" ON "Part"("organizationId");

-- CreateIndex
CREATE INDEX "Part_organizationId_oemPartNumber_idx" ON "Part"("organizationId", "oemPartNumber");

-- CreateIndex
CREATE INDEX "Part_organizationId_brand_idx" ON "Part"("organizationId", "brand");

-- CreateIndex
CREATE INDEX "Part_organizationId_category_idx" ON "Part"("organizationId", "category");

-- CreateIndex
CREATE INDEX "Part_organizationId_isActive_idx" ON "Part"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Part_organizationId_partNumber_key" ON "Part"("organizationId", "partNumber");

-- CreateIndex
CREATE INDEX "PartInventoryTransaction_partId_idx" ON "PartInventoryTransaction"("partId");

-- CreateIndex
CREATE INDEX "PartInventoryTransaction_partId_createdAt_idx" ON "PartInventoryTransaction"("partId", "createdAt");

-- CreateIndex
CREATE INDEX "PartInventoryTransaction_createdByMembershipId_idx" ON "PartInventoryTransaction"("createdByMembershipId");

-- CreateIndex
CREATE INDEX "PartInventoryTransaction_referenceType_referenceId_idx" ON "PartInventoryTransaction"("referenceType", "referenceId");

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartInventoryTransaction" ADD CONSTRAINT "PartInventoryTransaction_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartInventoryTransaction" ADD CONSTRAINT "PartInventoryTransaction_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
