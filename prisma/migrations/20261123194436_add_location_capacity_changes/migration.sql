/*
  Warnings:

  - A unique constraint covering the columns `[activeLocationCapacityChangeId]` on the table `OrganizationBilling` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BillingLocationCapacityChangeStatus" AS ENUM ('QUOTED', 'PROCESSING', 'PENDING_PAYMENT', 'APPLIED', 'REJECTED', 'EXPIRED', 'RECONCILIATION_REQUIRED');

-- AlterTable
ALTER TABLE "OrganizationBilling" ADD COLUMN     "activeLocationCapacityChangeId" TEXT;

-- CreateTable
CREATE TABLE "BillingLocationCapacityChange" (
    "id" TEXT NOT NULL,
    "organizationBillingId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "BillingLocationCapacityChangeStatus" NOT NULL DEFAULT 'QUOTED',
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "expectedAdditionalLocationQuantity" INTEGER NOT NULL,
    "targetAdditionalLocationQuantity" INTEGER NOT NULL,
    "expectedLastSyncedAt" TIMESTAMP(3),
    "prorationDate" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "estimatedAmountDue" BIGINT NOT NULL,
    "monthlyTotalAmount" BIGINT NOT NULL,
    "stripeUpdateParameters" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "stripeInvoiceId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingLocationCapacityChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingLocationCapacityChange_organizationBillingId_created_idx" ON "BillingLocationCapacityChange"("organizationBillingId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingLocationCapacityChange_organizationBillingId_status_idx" ON "BillingLocationCapacityChange"("organizationBillingId", "status");

-- CreateIndex
CREATE INDEX "BillingLocationCapacityChange_status_expiresAt_idx" ON "BillingLocationCapacityChange"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBilling_activeLocationCapacityChangeId_key" ON "OrganizationBilling"("activeLocationCapacityChangeId");

-- AddForeignKey
ALTER TABLE "BillingLocationCapacityChange" ADD CONSTRAINT "BillingLocationCapacityChange_organizationBillingId_fkey" FOREIGN KEY ("organizationBillingId") REFERENCES "OrganizationBilling"("id") ON DELETE CASCADE ON UPDATE CASCADE;
