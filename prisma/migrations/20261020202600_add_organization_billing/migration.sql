-- CreateEnum
CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('NOT_SUBSCRIBED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED');

-- CreateTable
CREATE TABLE "OrganizationBilling" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "planId" TEXT,
    "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'NOT_SUBSCRIBED',
    "currency" TEXT,
    "unitAmount" INTEGER,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "checkoutOperationId" TEXT,
    "checkoutSessionId" TEXT,
    "checkoutSessionExpiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationBilling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "eventCreatedAt" TIMESTAMP(3) NOT NULL,
    "stripeObjectId" TEXT,
    "processingToken" TEXT,
    "processingLeaseUntil" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBilling_organizationId_key" ON "OrganizationBilling"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBilling_stripeCustomerId_key" ON "OrganizationBilling"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBilling_stripeSubscriptionId_key" ON "OrganizationBilling"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBilling_checkoutOperationId_key" ON "OrganizationBilling"("checkoutOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBilling_checkoutSessionId_key" ON "OrganizationBilling"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "OrganizationBilling_status_idx" ON "OrganizationBilling"("status");

-- CreateIndex
CREATE INDEX "OrganizationBilling_planId_status_idx" ON "OrganizationBilling"("planId", "status");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_processedAt_processingLeaseUntil_idx" ON "StripeWebhookEvent"("processedAt", "processingLeaseUntil");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_type_eventCreatedAt_idx" ON "StripeWebhookEvent"("type", "eventCreatedAt");

-- AddForeignKey
ALTER TABLE "OrganizationBilling" ADD CONSTRAINT "OrganizationBilling_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
