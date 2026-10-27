/*
  Warnings:

  - A unique constraint covering the columns `[activeUserCapacityChangeId]` on the table `OrganizationBilling` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BillingUserCapacityChangeStatus" AS ENUM ('QUOTED', 'PROCESSING', 'PENDING_PAYMENT', 'APPLIED', 'REJECTED', 'EXPIRED', 'RECONCILIATION_REQUIRED');

-- AlterTable
ALTER TABLE "OrganizationBilling" ADD COLUMN     "activeUserCapacityChangeId" TEXT;

-- CreateTable
CREATE TABLE "BillingUserCapacityChange" (
    "id" TEXT NOT NULL,
    "organizationBillingId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "BillingUserCapacityChangeStatus" NOT NULL DEFAULT 'QUOTED',
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
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

    CONSTRAINT "BillingUserCapacityChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingUserCapacityChange_organizationBillingId_createdAt_idx" ON "BillingUserCapacityChange"("organizationBillingId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingUserCapacityChange_organizationBillingId_status_idx" ON "BillingUserCapacityChange"("organizationBillingId", "status");

-- CreateIndex
CREATE INDEX "BillingUserCapacityChange_status_expiresAt_idx" ON "BillingUserCapacityChange"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBilling_activeUserCapacityChangeId_key" ON "OrganizationBilling"("activeUserCapacityChangeId");

-- AddForeignKey
ALTER TABLE "BillingUserCapacityChange" ADD CONSTRAINT "BillingUserCapacityChange_organizationBillingId_fkey" FOREIGN KEY ("organizationBillingId") REFERENCES "OrganizationBilling"("id") ON DELETE CASCADE ON UPDATE CASCADE;
