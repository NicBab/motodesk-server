-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "cancellationNotes" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "status" "ScheduleStatus" NOT NULL DEFAULT 'SCHEDULED';

-- CreateIndex
CREATE INDEX "Schedule_organizationId_status_idx" ON "Schedule"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Schedule_repairOrderId_status_idx" ON "Schedule"("repairOrderId", "status");
