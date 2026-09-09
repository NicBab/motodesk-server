-- AlterTable
ALTER TABLE "User" ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "preferredTimezone" TEXT NOT NULL DEFAULT 'America/Chicago';
