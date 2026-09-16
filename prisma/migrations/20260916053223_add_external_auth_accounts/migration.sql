-- CreateEnum
CREATE TYPE "ExternalAuthProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateTable
CREATE TABLE "ExternalAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ExternalAuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "providerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalAuthAccount_userId_idx" ON "ExternalAuthAccount"("userId");

-- CreateIndex
CREATE INDEX "ExternalAuthAccount_provider_providerEmail_idx" ON "ExternalAuthAccount"("provider", "providerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAuthAccount_provider_providerAccountId_key" ON "ExternalAuthAccount"("provider", "providerAccountId");

-- AddForeignKey
ALTER TABLE "ExternalAuthAccount" ADD CONSTRAINT "ExternalAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
