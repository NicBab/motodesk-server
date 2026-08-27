-- CreateEnum
CREATE TYPE "PartReturnType" AS ENUM ('TO_VENDOR', 'TO_INVENTORY', 'WRONG_PART', 'DAMAGED', 'UNUSED_RO_PART', 'CORE_RETURN', 'WARRANTY_RETURN');

-- CreateEnum
CREATE TYPE "PartReturnCreditStatus" AS ENUM ('PENDING', 'RECEIVED');

-- CreateEnum
CREATE TYPE "PartReturnStatus" AS ENUM ('PENDING', 'SHIPPED', 'CREDITED', 'CLOSED');

-- CreateTable
CREATE TABLE "PartReturn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "returnNumber" INTEGER NOT NULL,
    "returnType" "PartReturnType" NOT NULL DEFAULT 'TO_VENDOR',
    "partId" TEXT,
    "partNumber" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "vendorId" TEXT,
    "vendorName" TEXT,
    "purchaseOrderId" TEXT,
    "poNumber" INTEGER,
    "repairOrderId" TEXT,
    "roNumber" INTEGER,
    "restockingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "returnAuthorizationNumber" TEXT,
    "creditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditStatus" "PartReturnCreditStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "status" "PartReturnStatus" NOT NULL DEFAULT 'PENDING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartReturnSequence" (
    "organizationId" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1001,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartReturnSequence_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE INDEX "PartReturn_organizationId_idx" ON "PartReturn"("organizationId");

-- CreateIndex
CREATE INDEX "PartReturn_organizationId_status_idx" ON "PartReturn"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PartReturn_organizationId_returnType_idx" ON "PartReturn"("organizationId", "returnType");

-- CreateIndex
CREATE INDEX "PartReturn_organizationId_creditStatus_idx" ON "PartReturn"("organizationId", "creditStatus");

-- CreateIndex
CREATE INDEX "PartReturn_organizationId_isActive_idx" ON "PartReturn"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "PartReturn_partId_idx" ON "PartReturn"("partId");

-- CreateIndex
CREATE INDEX "PartReturn_vendorId_idx" ON "PartReturn"("vendorId");

-- CreateIndex
CREATE INDEX "PartReturn_purchaseOrderId_idx" ON "PartReturn"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PartReturn_repairOrderId_idx" ON "PartReturn"("repairOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PartReturn_organizationId_returnNumber_key" ON "PartReturn"("organizationId", "returnNumber");

-- AddForeignKey
ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartReturn" ADD CONSTRAINT "PartReturn_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartReturnSequence" ADD CONSTRAINT "PartReturnSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
