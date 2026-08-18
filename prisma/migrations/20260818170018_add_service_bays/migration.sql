-- CreateEnum
CREATE TYPE "ServiceBayStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "ServiceBayAssignmentStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateTable
CREATE TABLE "ServiceBay" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ServiceBayStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBayAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceBayId" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "assignedByMembershipId" TEXT,
    "status" "ServiceBayAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ServiceBayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceBay_organizationId_idx" ON "ServiceBay"("organizationId");

-- CreateIndex
CREATE INDEX "ServiceBay_organizationId_status_idx" ON "ServiceBay"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBay_organizationId_name_key" ON "ServiceBay"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ServiceBayAssignment_organizationId_idx" ON "ServiceBayAssignment"("organizationId");

-- CreateIndex
CREATE INDEX "ServiceBayAssignment_serviceBayId_status_idx" ON "ServiceBayAssignment"("serviceBayId", "status");

-- CreateIndex
CREATE INDEX "ServiceBayAssignment_repairOrderId_status_idx" ON "ServiceBayAssignment"("repairOrderId", "status");

-- AddForeignKey
ALTER TABLE "ServiceBay" ADD CONSTRAINT "ServiceBay_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBayAssignment" ADD CONSTRAINT "ServiceBayAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBayAssignment" ADD CONSTRAINT "ServiceBayAssignment_serviceBayId_fkey" FOREIGN KEY ("serviceBayId") REFERENCES "ServiceBay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBayAssignment" ADD CONSTRAINT "ServiceBayAssignment_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBayAssignment" ADD CONSTRAINT "ServiceBayAssignment_assignedByMembershipId_fkey" FOREIGN KEY ("assignedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
