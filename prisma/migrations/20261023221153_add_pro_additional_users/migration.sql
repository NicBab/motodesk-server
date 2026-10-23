-- AlterTable
ALTER TABLE "OrganizationBilling" ADD COLUMN     "additionalUserQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "additionalUserUnitAmount" INTEGER,
ADD COLUMN     "stripeAdditionalUserItemId" TEXT,
ADD COLUMN     "stripeAdditionalUserPriceId" TEXT;
