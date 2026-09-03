-- CreateEnum
CREATE TYPE "ServiceAppointmentType" AS ENUM ('DROP_OFF', 'WAITING_CUSTOMER', 'PICKUP_AND_DELIVERY', 'MOBILE_SERVICE', 'INTERNAL_WORK', 'WALK_IN', 'PRE_DELIVERY_INSPECTION', 'WARRANTY', 'RECALL');

-- CreateEnum
CREATE TYPE "ServiceAppointmentStatus" AS ENUM ('REQUESTED', 'TENTATIVE', 'CONFIRMED', 'CHECKED_IN', 'CONVERTED_TO_RO', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "ServiceAppointmentContactMethod" AS ENUM ('PHONE', 'SMS', 'EMAIL', 'IN_PERSON');

-- CreateTable
CREATE TABLE "ServiceAppointment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appointmentNumber" INTEGER NOT NULL,
    "customerId" TEXT,
    "vehicleId" TEXT,
    "repairOrderId" TEXT,
    "customerName" TEXT NOT NULL,
    "appointmentType" "ServiceAppointmentType" NOT NULL DEFAULT 'DROP_OFF',
    "status" "ServiceAppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedService" TEXT NOT NULL,
    "customerComplaint" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "estimatedDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "preferredTechnicianEmployeeId" TEXT,
    "serviceAdvisorEmployeeId" TEXT,
    "waitingCustomer" BOOLEAN NOT NULL DEFAULT false,
    "transportationNeeded" BOOLEAN NOT NULL DEFAULT false,
    "contactMethod" "ServiceAppointmentContactMethod",
    "internalNotes" TEXT,
    "customerNotes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAppointmentSequence" (
    "organizationId" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1001,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceAppointmentSequence_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAppointment_repairOrderId_key" ON "ServiceAppointment"("repairOrderId");

-- CreateIndex
CREATE INDEX "ServiceAppointment_organizationId_idx" ON "ServiceAppointment"("organizationId");

-- CreateIndex
CREATE INDEX "ServiceAppointment_organizationId_scheduledStart_idx" ON "ServiceAppointment"("organizationId", "scheduledStart");

-- CreateIndex
CREATE INDEX "ServiceAppointment_organizationId_status_idx" ON "ServiceAppointment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ServiceAppointment_organizationId_customerId_idx" ON "ServiceAppointment"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "ServiceAppointment_organizationId_vehicleId_idx" ON "ServiceAppointment"("organizationId", "vehicleId");

-- CreateIndex
CREATE INDEX "ServiceAppointment_preferredTechnicianEmployeeId_idx" ON "ServiceAppointment"("preferredTechnicianEmployeeId");

-- CreateIndex
CREATE INDEX "ServiceAppointment_serviceAdvisorEmployeeId_idx" ON "ServiceAppointment"("serviceAdvisorEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAppointment_organizationId_appointmentNumber_key" ON "ServiceAppointment"("organizationId", "appointmentNumber");

-- AddForeignKey
ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_preferredTechnicianEmployeeId_fkey" FOREIGN KEY ("preferredTechnicianEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_serviceAdvisorEmployeeId_fkey" FOREIGN KEY ("serviceAdvisorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAppointmentSequence" ADD CONSTRAINT "ServiceAppointmentSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
