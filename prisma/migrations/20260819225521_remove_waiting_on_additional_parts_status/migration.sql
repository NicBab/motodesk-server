/*
  Warnings:

  - The values [WAITING_ON_ADDITIONAL_PARTS] on the enum `RepairOrderStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "RepairOrderStatus_new" AS ENUM ('ESTIMATE', 'AWAITING_CUSTOMER_APPROVAL', 'APPROVED', 'PARTS_REVIEW', 'WAITING_ON_PARTS', 'READY_TO_WORK', 'SCHEDULED', 'IN_PROGRESS', 'PAUSED', 'WAITING_ON_ADDITIONAL_APPROVAL', 'WORK_COMPLETE', 'QUALITY_CHECK', 'READY_FOR_PICKUP', 'CASHIERED', 'COMPLETED', 'PICKED_UP', 'CLOSED', 'CANCELLED');
ALTER TABLE "public"."RepairOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "RepairOrder" ALTER COLUMN "status" TYPE "RepairOrderStatus_new" USING ("status"::text::"RepairOrderStatus_new");
ALTER TABLE "RepairOrderStatusHistory" ALTER COLUMN "status" TYPE "RepairOrderStatus_new" USING ("status"::text::"RepairOrderStatus_new");
ALTER TABLE "RepairOrderStatusHistory" ALTER COLUMN "previousStatus" TYPE "RepairOrderStatus_new" USING ("previousStatus"::text::"RepairOrderStatus_new");
ALTER TYPE "RepairOrderStatus" RENAME TO "RepairOrderStatus_old";
ALTER TYPE "RepairOrderStatus_new" RENAME TO "RepairOrderStatus";
DROP TYPE "public"."RepairOrderStatus_old";
ALTER TABLE "RepairOrder" ALTER COLUMN "status" SET DEFAULT 'ESTIMATE';
COMMIT;
