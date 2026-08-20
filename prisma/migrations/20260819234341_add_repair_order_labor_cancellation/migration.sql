-- CreateTable
CREATE TABLE "RepairOrderLaborCancellation" (
    "id" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "laborLineId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cancelledByMembershipId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairOrderLaborCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepairOrderLaborCancellation_repairOrderId_idx" ON "RepairOrderLaborCancellation"("repairOrderId");

-- CreateIndex
CREATE INDEX "RepairOrderLaborCancellation_laborLineId_idx" ON "RepairOrderLaborCancellation"("laborLineId");

-- CreateIndex
CREATE INDEX "RepairOrderLaborCancellation_organizationId_idx" ON "RepairOrderLaborCancellation"("organizationId");

-- AddForeignKey
ALTER TABLE "RepairOrderLaborCancellation" ADD CONSTRAINT "RepairOrderLaborCancellation_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrderLaborCancellation" ADD CONSTRAINT "RepairOrderLaborCancellation_laborLineId_fkey" FOREIGN KEY ("laborLineId") REFERENCES "RepairOrderLaborLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrderLaborCancellation" ADD CONSTRAINT "RepairOrderLaborCancellation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrderLaborCancellation" ADD CONSTRAINT "RepairOrderLaborCancellation_cancelledByMembershipId_fkey" FOREIGN KEY ("cancelledByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
