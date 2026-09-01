-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('POS', 'RO', 'REFUND');

-- CreateEnum
CREATE TYPE "SaleLineType" AS ENUM ('PART', 'LABOR');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'REFUNDED', 'VOID');

-- CreateEnum
CREATE TYPE "SalePaymentMethod" AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'CHECK', 'ACH', 'EXTERNAL_TERMINAL', 'SPLIT');

-- CreateEnum
CREATE TYPE "SaleReturnReason" AS ENUM ('WRONG_PART', 'DEFECTIVE_PART', 'WARRANTY', 'CUSTOMER_CANCELLED', 'DUPLICATE_SALE', 'PRICING_ADJUSTMENT', 'LABOR_REFUND', 'GOODWILL', 'INVENTORY_CORRECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "SaleReturnDisposition" AS ENUM ('RETURN_TO_INVENTORY', 'SCRAP_NON_RESELLABLE');

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleNumber" INTEGER NOT NULL,
    "type" "SaleType" NOT NULL DEFAULT 'POS',
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "repairOrderId" TEXT,
    "roNumber" INTEGER,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "taxRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentMethod" "SalePaymentMethod" NOT NULL,
    "cashierMembershipId" TEXT,
    "cashierName" TEXT,
    "originalSaleId" TEXT,
    "originalSaleNumber" INTEGER,
    "returnReason" "SaleReturnReason",
    "returnDisposition" "SaleReturnDisposition",
    "managerNotes" TEXT,
    "processedByMembershipId" TEXT,
    "processedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "type" "SaleLineType" NOT NULL,
    "partId" TEXT,
    "originalSaleLineId" TEXT,
    "partNumber" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "returnedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "SalePaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleSequence" (
    "organizationId" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1001,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleSequence_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE INDEX "Sale_organizationId_idx" ON "Sale"("organizationId");

-- CreateIndex
CREATE INDEX "Sale_organizationId_type_idx" ON "Sale"("organizationId", "type");

-- CreateIndex
CREATE INDEX "Sale_organizationId_status_idx" ON "Sale"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Sale_organizationId_createdAt_idx" ON "Sale"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- CreateIndex
CREATE INDEX "Sale_repairOrderId_idx" ON "Sale"("repairOrderId");

-- CreateIndex
CREATE INDEX "Sale_originalSaleId_idx" ON "Sale"("originalSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_organizationId_saleNumber_key" ON "Sale"("organizationId", "saleNumber");

-- CreateIndex
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");

-- CreateIndex
CREATE INDEX "SaleLine_partId_idx" ON "SaleLine"("partId");

-- CreateIndex
CREATE INDEX "SaleLine_originalSaleLineId_idx" ON "SaleLine"("originalSaleLineId");

-- CreateIndex
CREATE INDEX "SalePayment_saleId_idx" ON "SalePayment"("saleId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_originalSaleId_fkey" FOREIGN KEY ("originalSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_originalSaleLineId_fkey" FOREIGN KEY ("originalSaleLineId") REFERENCES "SaleLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleSequence" ADD CONSTRAINT "SaleSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
