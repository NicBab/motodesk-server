/*
  Warnings:

  - A unique constraint covering the columns `[activePlanChangeId]` on the table `OrganizationBilling` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BillingPlanChangeStatus" AS ENUM ('QUOTED', 'PROCESSING', 'PENDING_PAYMENT', 'APPLIED', 'REJECTED', 'EXPIRED', 'RECONCILIATION_REQUIRED');

-- AlterTable
ALTER TABLE "OrganizationBilling" ADD COLUMN     "activePlanChangeId" TEXT;

-- CreateTable
CREATE TABLE "BillingPlanChange" (
    "id" TEXT NOT NULL,
    "organizationBillingId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "BillingPlanChangeStatus" NOT NULL DEFAULT 'QUOTED',
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "expectedStripePriceId" TEXT NOT NULL,
    "expectedPlanId" TEXT NOT NULL,
    "targetPlanId" TEXT NOT NULL,
    "expectedAdditionalUserQuantity" INTEGER NOT NULL,
    "targetAdditionalUserQuantity" INTEGER NOT NULL,
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

    CONSTRAINT "BillingPlanChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingPlanChange_organizationBillingId_createdAt_idx" ON "BillingPlanChange"("organizationBillingId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingPlanChange_organizationBillingId_status_idx" ON "BillingPlanChange"("organizationBillingId", "status");

-- CreateIndex
CREATE INDEX "BillingPlanChange_status_expiresAt_idx" ON "BillingPlanChange"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBilling_activePlanChangeId_key" ON "OrganizationBilling"("activePlanChangeId");

-- AddForeignKey
ALTER TABLE "BillingPlanChange" ADD CONSTRAINT "BillingPlanChange_organizationBillingId_fkey" FOREIGN KEY ("organizationBillingId") REFERENCES "OrganizationBilling"("id") ON DELETE CASCADE ON UPDATE CASCADE;
