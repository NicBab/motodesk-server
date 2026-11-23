-- CreateEnum
CREATE TYPE "ShopLocationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ShopLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "ShopLocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopLocation_organizationId_status_idx" ON "ShopLocation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ShopLocation_organizationId_isDefault_idx" ON "ShopLocation"("organizationId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "ShopLocation_organizationId_code_key" ON "ShopLocation"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ShopLocation_organizationId_name_key" ON "ShopLocation"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "ShopLocation" ADD CONSTRAINT "ShopLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce one default location per organization
CREATE UNIQUE INDEX "ShopLocation_single_default_per_organization_key"
ON "ShopLocation"("organizationId")
WHERE "isDefault" = true;

-- Default locations must remain active
ALTER TABLE "ShopLocation"
ADD CONSTRAINT "ShopLocation_default_must_be_active_check"
CHECK ("isDefault" = false OR "status" = 'ACTIVE');

-- Create a default shop for existing organizations
INSERT INTO "ShopLocation" (
    "id",
    "organizationId",
    "name",
    "code",
    "email",
    "phone",
    "country",
    "timezone",
    "isDefault",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    'loc_' || "id",
    "id",
    'Main Shop',
    'MAIN',
    "email",
    "phone",
    'US',
    'America/Chicago',
    true,
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Organization";
