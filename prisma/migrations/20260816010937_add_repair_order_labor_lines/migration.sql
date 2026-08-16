-- CreateTable
CREATE TABLE "RepairOrderLaborLine" (
    "id" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "technicianMembershipId" TEXT,
    "description" TEXT NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairOrderLaborLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepairOrderLaborLine_repairOrderId_idx" ON "RepairOrderLaborLine"("repairOrderId");

-- CreateIndex
CREATE INDEX "RepairOrderLaborLine_technicianMembershipId_idx" ON "RepairOrderLaborLine"("technicianMembershipId");

-- CreateIndex
CREATE INDEX "RepairOrderLaborLine_repairOrderId_completed_idx" ON "RepairOrderLaborLine"("repairOrderId", "completed");

-- AddForeignKey
ALTER TABLE "RepairOrderLaborLine" ADD CONSTRAINT "RepairOrderLaborLine_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrderLaborLine" ADD CONSTRAINT "RepairOrderLaborLine_technicianMembershipId_fkey" FOREIGN KEY ("technicianMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
