-- CreateEnum
CREATE TYPE "EmployeeTimeEntryStatus" AS ENUM ('CLOCKED_IN', 'ON_BREAK', 'CLOCKED_OUT');

-- CreateEnum
CREATE TYPE "EmployeeTimeEntryAuthMethod" AS ENUM ('PIN', 'MANUAL');

-- CreateEnum
CREATE TYPE "EmployeeTimeEntrySource" AS ENUM ('TIME_CLOCK_KIOSK', 'MANAGER_ENTRY', 'MANAGER_CORRECTION');

-- CreateTable
CREATE TABLE "EmployeeTimeEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockOutAt" TIMESTAMP(3),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedMinutes" INTEGER,
    "status" "EmployeeTimeEntryStatus" NOT NULL DEFAULT 'CLOCKED_IN',
    "source" "EmployeeTimeEntrySource" NOT NULL DEFAULT 'TIME_CLOCK_KIOSK',
    "authMethod" "EmployeeTimeEntryAuthMethod" NOT NULL DEFAULT 'PIN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTimeEntryCorrection" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "originalValue" TEXT,
    "updatedValue" TEXT,
    "reason" TEXT NOT NULL,
    "managerMembershipId" TEXT,
    "managerName" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeTimeEntryCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeTimeEntry_organizationId_idx" ON "EmployeeTimeEntry"("organizationId");

-- CreateIndex
CREATE INDEX "EmployeeTimeEntry_employeeId_idx" ON "EmployeeTimeEntry"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeTimeEntry_organizationId_status_idx" ON "EmployeeTimeEntry"("organizationId", "status");

-- CreateIndex
CREATE INDEX "EmployeeTimeEntry_organizationId_clockInAt_idx" ON "EmployeeTimeEntry"("organizationId", "clockInAt");

-- CreateIndex
CREATE INDEX "EmployeeTimeEntry_employeeId_clockInAt_idx" ON "EmployeeTimeEntry"("employeeId", "clockInAt");

-- CreateIndex
CREATE INDEX "EmployeeTimeEntryCorrection_timeEntryId_idx" ON "EmployeeTimeEntryCorrection"("timeEntryId");

-- CreateIndex
CREATE INDEX "EmployeeTimeEntryCorrection_managerMembershipId_idx" ON "EmployeeTimeEntryCorrection"("managerMembershipId");

-- CreateIndex
CREATE INDEX "EmployeeTimeEntryCorrection_changedAt_idx" ON "EmployeeTimeEntryCorrection"("changedAt");

-- AddForeignKey
ALTER TABLE "EmployeeTimeEntry" ADD CONSTRAINT "EmployeeTimeEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTimeEntry" ADD CONSTRAINT "EmployeeTimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTimeEntryCorrection" ADD CONSTRAINT "EmployeeTimeEntryCorrection_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "EmployeeTimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTimeEntryCorrection" ADD CONSTRAINT "EmployeeTimeEntryCorrection_managerMembershipId_fkey" FOREIGN KEY ("managerMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
