-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ScheduleStatus" ADD VALUE 'TENTATIVE';
ALTER TYPE "ScheduleStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "ScheduleStatus" ADD VALUE 'READY';
ALTER TYPE "ScheduleStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "ScheduleStatus" ADD VALUE 'PAUSED';
ALTER TYPE "ScheduleStatus" ADD VALUE 'BLOCKED';
ALTER TYPE "ScheduleStatus" ADD VALUE 'MISSED';
ALTER TYPE "ScheduleStatus" ADD VALUE 'RESCHEDULE_REQUIRED';

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "actualCompletedAt" TIMESTAMP(3),
ADD COLUMN     "actualStartedAt" TIMESTAMP(3),
ADD COLUMN     "laborLineId" TEXT,
ADD COLUMN     "scheduledEnd" TIMESTAMP(3),
ADD COLUMN     "technicianEmployeeId" TEXT,
ADD COLUMN     "waitingCustomer" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Schedule_organizationId_scheduledEnd_idx" ON "Schedule"("organizationId", "scheduledEnd");

-- CreateIndex
CREATE INDEX "Schedule_organizationId_technicianEmployeeId_idx" ON "Schedule"("organizationId", "technicianEmployeeId");

-- CreateIndex
CREATE INDEX "Schedule_organizationId_technicianEmployeeId_scheduledDate_idx" ON "Schedule"("organizationId", "technicianEmployeeId", "scheduledDate");

-- CreateIndex
CREATE INDEX "Schedule_laborLineId_idx" ON "Schedule"("laborLineId");

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_technicianEmployeeId_fkey" FOREIGN KEY ("technicianEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_laborLineId_fkey" FOREIGN KEY ("laborLineId") REFERENCES "RepairOrderLaborLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
