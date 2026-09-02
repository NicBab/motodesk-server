-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('TECHNICIAN', 'SERVICE_ADVISOR', 'SHOP_MANAGER', 'CASHIER', 'PARTS_SPECIALIST');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
ALTER TYPE "SaleStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "EmployeeRole" NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT,
    "email" TEXT,
    "hourlyRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "laborRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hireDate" TIMESTAMP(3),
    "pinHash" TEXT,
    "isSchedulable" BOOLEAN NOT NULL DEFAULT true,
    "dailyStartTime" TEXT NOT NULL DEFAULT '08:00',
    "dailyEndTime" TEXT NOT NULL DEFAULT '17:00',
    "maxDailyHours" DECIMAL(5,2) NOT NULL DEFAULT 8,
    "skills" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_membershipId_key" ON "Employee"("membershipId");

-- CreateIndex
CREATE INDEX "Employee_organizationId_idx" ON "Employee"("organizationId");

-- CreateIndex
CREATE INDEX "Employee_organizationId_status_idx" ON "Employee"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Employee_organizationId_role_idx" ON "Employee"("organizationId", "role");

-- CreateIndex
CREATE INDEX "Employee_organizationId_lastName_firstName_idx" ON "Employee"("organizationId", "lastName", "firstName");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
