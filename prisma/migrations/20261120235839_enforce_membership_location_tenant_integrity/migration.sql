/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,id]` on the table `Membership` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,id]` on the table `ShopLocation` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "MembershipLocation" DROP CONSTRAINT "MembershipLocation_membershipId_fkey";

-- DropForeignKey
ALTER TABLE "MembershipLocation" DROP CONSTRAINT "MembershipLocation_shopLocationId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_id_key" ON "Membership"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ShopLocation_organizationId_id_key" ON "ShopLocation"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "MembershipLocation" ADD CONSTRAINT "MembershipLocation_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipLocation" ADD CONSTRAINT "MembershipLocation_organizationId_shopLocationId_fkey" FOREIGN KEY ("organizationId", "shopLocationId") REFERENCES "ShopLocation"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
