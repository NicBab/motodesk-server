-- AlterTable
ALTER TABLE "MembershipInvitation" ADD COLUMN     "employeeId" TEXT;

-- CreateIndex
CREATE INDEX "MembershipInvitation_employeeId_idx" ON "MembershipInvitation"("employeeId");
