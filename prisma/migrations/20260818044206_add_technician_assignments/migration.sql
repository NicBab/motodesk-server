-- CreateEnum
CREATE TYPE "TechnicianAssignmentStatus" AS ENUM ('ACTIVE', 'REASSIGNED', 'REMOVED');

-- CreateTable
CREATE TABLE "TechnicianAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "technicianMembershipId" TEXT NOT NULL,
    "assignedByMembershipId" TEXT,
    "status" "TechnicianAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "TechnicianAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TechnicianAssignment_organizationId_idx" ON "TechnicianAssignment"("organizationId");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_repairOrderId_idx" ON "TechnicianAssignment"("repairOrderId");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_technicianMembershipId_idx" ON "TechnicianAssignment"("technicianMembershipId");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_repairOrderId_status_idx" ON "TechnicianAssignment"("repairOrderId", "status");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_organizationId_technicianMembershipId__idx" ON "TechnicianAssignment"("organizationId", "technicianMembershipId", "status");

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_technicianMembershipId_fkey" FOREIGN KEY ("technicianMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_assignedByMembershipId_fkey" FOREIGN KEY ("assignedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
