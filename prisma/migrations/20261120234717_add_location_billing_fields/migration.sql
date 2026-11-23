-- AlterTable
ALTER TABLE "OrganizationBilling" ADD COLUMN     "additionalLocationQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "additionalLocationUnitAmount" INTEGER,
ADD COLUMN     "stripeAdditionalLocationItemId" TEXT,
ADD COLUMN     "stripeAdditionalLocationPriceId" TEXT;
