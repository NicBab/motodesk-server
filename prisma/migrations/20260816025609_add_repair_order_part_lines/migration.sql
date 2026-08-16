-- CreateEnum
CREATE TYPE "RepairOrderPartStatus" AS ENUM ('NEEDS_REVIEW', 'AVAILABLE', 'ALLOCATED', 'TO_BE_ORDERED', 'ORDERED', 'PARTIALLY_RECEIVED', 'BACKORDERED', 'RECEIVED', 'PULLED', 'STAGED', 'ISSUED', 'INSTALLED', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepairOrderPartResolutionMethod" AS ENUM ('SHOP_INVENTORY', 'ORIGINAL_PO', 'ALTERNATE_VENDOR', 'LOCAL_DEALER', 'MANUAL_PURCHASE', 'APPROVED_SUBSTITUTE', 'CUSTOMER_SUPPLIED', 'INVENTORY_TRANSFER', 'NOT_REQUIRED', 'MANAGER_OVERRIDE');

-- CreateTable
CREATE TABLE "RepairOrderPartLine" (
    "id" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "partId" TEXT,
    "partNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "requiredQty" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "approvedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "allocatedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "orderedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "receivedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "pulledQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "installedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vendorName" TEXT,
    "status" "RepairOrderPartStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "resolutionMethod" "RepairOrderPartResolutionMethod",
    "blocksWork" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairOrderPartLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepairOrderPartLine_repairOrderId_idx" ON "RepairOrderPartLine"("repairOrderId");

-- CreateIndex
CREATE INDEX "RepairOrderPartLine_partId_idx" ON "RepairOrderPartLine"("partId");

-- CreateIndex
CREATE INDEX "RepairOrderPartLine_repairOrderId_status_idx" ON "RepairOrderPartLine"("repairOrderId", "status");

-- CreateIndex
CREATE INDEX "RepairOrderPartLine_repairOrderId_blocksWork_idx" ON "RepairOrderPartLine"("repairOrderId", "blocksWork");

-- AddForeignKey
ALTER TABLE "RepairOrderPartLine" ADD CONSTRAINT "RepairOrderPartLine_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrderPartLine" ADD CONSTRAINT "RepairOrderPartLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;
