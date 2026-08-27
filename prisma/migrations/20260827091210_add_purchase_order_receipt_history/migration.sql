-- CreateTable
CREATE TABLE "PurchaseOrderReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "packingSlip" TEXT,
    "notes" TEXT,
    "receivedByMembershipId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "partId" TEXT,
    "repairOrderPartLineId" TEXT,
    "partNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "receivedQty" DECIMAL(12,3) NOT NULL,
    "damagedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "backorderedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(12,2),
    "binLocation" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrderReceipt_organizationId_idx" ON "PurchaseOrderReceipt"("organizationId");

-- CreateIndex
CREATE INDEX "PurchaseOrderReceipt_purchaseOrderId_idx" ON "PurchaseOrderReceipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderReceipt_receivedByMembershipId_idx" ON "PurchaseOrderReceipt"("receivedByMembershipId");

-- CreateIndex
CREATE INDEX "PurchaseOrderReceipt_receivedAt_idx" ON "PurchaseOrderReceipt"("receivedAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderReceiptLine_receiptId_idx" ON "PurchaseOrderReceiptLine"("receiptId");

-- CreateIndex
CREATE INDEX "PurchaseOrderReceiptLine_purchaseOrderLineId_idx" ON "PurchaseOrderReceiptLine"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "PurchaseOrderReceiptLine_partId_idx" ON "PurchaseOrderReceiptLine"("partId");

-- CreateIndex
CREATE INDEX "PurchaseOrderReceiptLine_repairOrderPartLineId_idx" ON "PurchaseOrderReceiptLine"("repairOrderPartLineId");

-- AddForeignKey
ALTER TABLE "PurchaseOrderReceipt" ADD CONSTRAINT "PurchaseOrderReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderReceipt" ADD CONSTRAINT "PurchaseOrderReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderReceipt" ADD CONSTRAINT "PurchaseOrderReceipt_receivedByMembershipId_fkey" FOREIGN KEY ("receivedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderReceiptLine" ADD CONSTRAINT "PurchaseOrderReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseOrderReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderReceiptLine" ADD CONSTRAINT "PurchaseOrderReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderReceiptLine" ADD CONSTRAINT "PurchaseOrderReceiptLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderReceiptLine" ADD CONSTRAINT "PurchaseOrderReceiptLine_repairOrderPartLineId_fkey" FOREIGN KEY ("repairOrderPartLineId") REFERENCES "RepairOrderPartLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
