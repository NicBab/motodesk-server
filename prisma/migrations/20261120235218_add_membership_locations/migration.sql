-- CreateTable
CREATE TABLE "MembershipLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "shopLocationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipLocation_organizationId_shopLocationId_idx" ON "MembershipLocation"("organizationId", "shopLocationId");

-- CreateIndex
CREATE INDEX "MembershipLocation_organizationId_membershipId_idx" ON "MembershipLocation"("organizationId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipLocation_membershipId_shopLocationId_key" ON "MembershipLocation"("membershipId", "shopLocationId");

-- AddForeignKey
ALTER TABLE "MembershipLocation" ADD CONSTRAINT "MembershipLocation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipLocation" ADD CONSTRAINT "MembershipLocation_shopLocationId_fkey" FOREIGN KEY ("shopLocationId") REFERENCES "ShopLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
