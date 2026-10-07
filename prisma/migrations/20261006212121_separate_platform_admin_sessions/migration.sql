-- CreateEnum
CREATE TYPE "SessionAudience" AS ENUM ('CLIENT', 'PLATFORM_ADMIN');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "audience" "SessionAudience" NOT NULL DEFAULT 'CLIENT';

-- CreateIndex
CREATE INDEX "Session_userId_audience_idx" ON "Session"("userId", "audience");
