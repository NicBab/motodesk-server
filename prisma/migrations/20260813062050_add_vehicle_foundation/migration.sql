-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTORCYCLE', 'ATV', 'UTV', 'SCOOTER', 'PWC', 'SNOWMOBILE');

-- CreateEnum
CREATE TYPE "VehicleClassification" AS ENUM ('NEW', 'USED', 'SERVICE');

-- CreateEnum
CREATE TYPE "VehicleInventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'PENDING_SALE', 'SOLD', 'WHOLESALE', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "year" INTEGER,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "trim" TEXT,
    "vin" TEXT,
    "mileage" INTEGER,
    "color" TEXT,
    "licensePlate" TEXT,
    "type" "VehicleType",
    "classification" "VehicleClassification" NOT NULL DEFAULT 'SERVICE',
    "inventoryStatus" "VehicleInventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "stockNumber" TEXT,
    "listPrice" DECIMAL(12,2),
    "unitCost" DECIMAL(12,2),
    "salesperson" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_idx" ON "Vehicle"("organizationId");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_customerId_idx" ON "Vehicle"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_make_model_idx" ON "Vehicle"("organizationId", "make", "model");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_classification_idx" ON "Vehicle"("organizationId", "classification");

-- CreateIndex
CREATE INDEX "Vehicle_organizationId_inventoryStatus_idx" ON "Vehicle"("organizationId", "inventoryStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_organizationId_vin_key" ON "Vehicle"("organizationId", "vin");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_organizationId_stockNumber_key" ON "Vehicle"("organizationId", "stockNumber");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
