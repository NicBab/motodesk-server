-- CreateEnum
CREATE TYPE "RepairOrderLaborStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "RepairOrderLaborLine" ADD COLUMN     "status" "RepairOrderLaborStatus" NOT NULL DEFAULT 'PROPOSED';
