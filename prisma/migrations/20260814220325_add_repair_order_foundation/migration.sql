-- CreateEnum
CREATE TYPE "RepairOrderStatus" AS ENUM ('ESTIMATE', 'AWAITING_CUSTOMER_APPROVAL', 'APPROVED', 'PARTS_REVIEW', 'WAITING_ON_PARTS', 'READY_TO_WORK', 'SCHEDULED', 'IN_PROGRESS', 'PAUSED', 'WAITING_ON_ADDITIONAL_APPROVAL', 'WAITING_ON_ADDITIONAL_PARTS', 'WORK_COMPLETE', 'QUALITY_CHECK', 'READY_FOR_PICKUP', 'CASHIERED', 'COMPLETED', 'PICKED_UP', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepairOrderPriority" AS ENUM ('STANDARD', 'RUSH', 'EMERGENCY', 'HOLD');

-- CreateEnum
CREATE TYPE "RepairOrderApprovalMethod" AS ENUM ('PHONE', 'SMS', 'EMAIL', 'CUSTOMER_PORTAL', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "RepairOrderCashierStatus" AS ENUM ('NOT_CASHIERED', 'IN_PROGRESS', 'COMPLETED', 'VOIDED', 'REVERSED');

-- CreateEnum
CREATE TYPE "RepairOrderPickupStatus" AS ENUM ('NOT_READY', 'READY', 'COMPLETED', 'REVERSED');

-- CreateTable
CREATE TABLE "RepairOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "roNumber" INTEGER NOT NULL,
    "status" "RepairOrderStatus" NOT NULL DEFAULT 'ESTIMATE',
    "priority" "RepairOrderPriority" NOT NULL DEFAULT 'STANDARD',
    "serviceAdvisorMembershipId" TEXT,
    "primaryTechnicianMembershipId" TEXT,
    "promisedDate" TIMESTAMP(3),
    "scheduledDate" TIMESTAMP(3),
    "complaint" TEXT,
    "notes" TEXT,
    "taxRate" DECIMAL(7,4),
    "shopSuppliesRate" DECIMAL(7,4) NOT NULL DEFAULT 6,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approvalMethod" "RepairOrderApprovalMethod",
    "approvalDate" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAmount" DECIMAL(12,2),
    "approvalNotes" TEXT,
    "cashierStatus" "RepairOrderCashierStatus" NOT NULL DEFAULT 'NOT_CASHIERED',
    "cashieredDate" TIMESTAMP(3),
    "paymentReference" TEXT,
    "paymentRemote" BOOLEAN NOT NULL DEFAULT false,
    "remainingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pickupStatus" "RepairOrderPickupStatus" NOT NULL DEFAULT 'NOT_READY',
    "pickupDate" TIMESTAMP(3),
    "pickupRecipient" TEXT,
    "pickupNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairOrderStatusHistory" (
    "id" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "status" "RepairOrderStatus" NOT NULL,
    "previousStatus" "RepairOrderStatus",
    "changedByMembershipId" TEXT,
    "notes" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairOrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairOrderSequence" (
    "organizationId" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1001,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairOrderSequence_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE INDEX "RepairOrder_organizationId_idx" ON "RepairOrder"("organizationId");

-- CreateIndex
CREATE INDEX "RepairOrder_organizationId_customerId_idx" ON "RepairOrder"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "RepairOrder_organizationId_vehicleId_idx" ON "RepairOrder"("organizationId", "vehicleId");

-- CreateIndex
CREATE INDEX "RepairOrder_organizationId_status_idx" ON "RepairOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "RepairOrder_organizationId_priority_idx" ON "RepairOrder"("organizationId", "priority");

-- CreateIndex
CREATE INDEX "RepairOrder_organizationId_scheduledDate_idx" ON "RepairOrder"("organizationId", "scheduledDate");

-- CreateIndex
CREATE INDEX "RepairOrder_organizationId_serviceAdvisorMembershipId_idx" ON "RepairOrder"("organizationId", "serviceAdvisorMembershipId");

-- CreateIndex
CREATE INDEX "RepairOrder_organizationId_primaryTechnicianMembershipId_idx" ON "RepairOrder"("organizationId", "primaryTechnicianMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "RepairOrder_organizationId_roNumber_key" ON "RepairOrder"("organizationId", "roNumber");

-- CreateIndex
CREATE INDEX "RepairOrderStatusHistory_repairOrderId_idx" ON "RepairOrderStatusHistory"("repairOrderId");

-- CreateIndex
CREATE INDEX "RepairOrderStatusHistory_repairOrderId_changedAt_idx" ON "RepairOrderStatusHistory"("repairOrderId", "changedAt");

-- CreateIndex
CREATE INDEX "RepairOrderStatusHistory_changedByMembershipId_idx" ON "RepairOrderStatusHistory"("changedByMembershipId");

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_serviceAdvisorMembershipId_fkey" FOREIGN KEY ("serviceAdvisorMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_primaryTechnicianMembershipId_fkey" FOREIGN KEY ("primaryTechnicianMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrderStatusHistory" ADD CONSTRAINT "RepairOrderStatusHistory_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrderStatusHistory" ADD CONSTRAINT "RepairOrderStatusHistory_changedByMembershipId_fkey" FOREIGN KEY ("changedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrderSequence" ADD CONSTRAINT "RepairOrderSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
