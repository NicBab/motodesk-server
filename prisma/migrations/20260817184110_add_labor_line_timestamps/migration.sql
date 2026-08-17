-- AlterTable
ALTER TABLE "RepairOrderLaborLine" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RepairOrderLaborLine_repairOrderId_startedAt_idx" ON "RepairOrderLaborLine"("repairOrderId", "startedAt");

-- CreateIndex
CREATE INDEX "RepairOrderLaborLine_repairOrderId_completedAt_idx" ON "RepairOrderLaborLine"("repairOrderId", "completedAt");
