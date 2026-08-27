import { findPartOrderDemand } from "./part-order-demand.repository.js";

import type { ListPartOrderDemandQueryInput } from "./part-order-demand.schemas.js";

//************************************************************** */

export type PartOrderDemandItem = {
  partLineId: string;

  repairOrderId: string;

  roNumber: number;

  customerName: string;

  vehicleDescription: string;

  partId: string | null;

  partNumber: string;

  description: string;

  requiredQty: number;

  approvedQty: number;

  allocatedQty: number;

  orderedQty: number;

  availableQty: number;

  qtyToOrder: number;

  estimatedCost: number;

  vendorName: string | null;

  status: "NEEDS_REVIEW" | "TO_BE_ORDERED";

  resolutionMethod: string | null;

  blocksWork: boolean;

  alreadyOnPurchaseOrder: boolean;

  purchaseOrderNumbers: number[];

  dateNeeded: Date;
};

//************************************************************** */

export async function listPartOrderDemand(
  organizationId: string,
  query: ListPartOrderDemandQueryInput,
): Promise<PartOrderDemandItem[]> {
  const lines = await findPartOrderDemand(organizationId, query);

  return lines
    .map((line) => {
      const requiredQty = Number(line.requiredQty.toString());

      const approvedQty = Number(line.approvedQty.toString());

      const allocatedQty = Number(line.allocatedQty.toString());

      const orderedQty = Number(line.orderedQty.toString());

      const inventoryAvailable = line.part
        ? Math.max(
            Number(line.part.qtyOnHand.toString()) -
              Number(line.part.qtyAllocated.toString()),
            0,
          )
        : 0;

      /*
       * Inventory already allocated specifically
       * to this RO line has already been accounted
       * for globally in qtyAllocated, so we add this
       * line's allocation back when determining what
       * is still available to satisfy this line.
       */
      const availableQty = line.part ? inventoryAvailable + allocatedQty : 0;

      const effectiveRequiredQty =
        approvedQty > 0 ? Math.min(requiredQty, approvedQty) : requiredQty;

      const qtyToOrder = Math.max(
        effectiveRequiredQty -
          allocatedQty -
          orderedQty -
          Math.max(availableQty - allocatedQty, 0),
        0,
      );

      const purchaseOrderNumbers = Array.from(
        new Set(
          line.purchaseOrderLines.map(
            (purchaseOrderLine) => purchaseOrderLine.purchaseOrder.poNumber,
          ),
        ),
      );

      return {
        partLineId: line.id,

        repairOrderId: line.repairOrder.id,

        roNumber: line.repairOrder.roNumber,

        customerName: formatCustomerName(line.repairOrder.customer),

        vehicleDescription: formatVehicleDescription(line.repairOrder.vehicle),

        partId: line.partId,

        partNumber: line.partNumber,

        description: line.description,

        requiredQty,

        approvedQty,

        allocatedQty,

        orderedQty,

        availableQty,

        qtyToOrder,

        estimatedCost: Number(line.estimatedCost.toString()),

        vendorName: line.vendorName,

        status: line.status as "NEEDS_REVIEW" | "TO_BE_ORDERED",

        resolutionMethod: line.resolutionMethod,

        blocksWork: line.blocksWork,

        alreadyOnPurchaseOrder: purchaseOrderNumbers.length > 0,

        purchaseOrderNumbers,

        dateNeeded: line.repairOrder.createdAt,
      };
    })
    .filter((item) => item.qtyToOrder > 0 || item.status === "NEEDS_REVIEW");
}

//************************************************************** */

function formatCustomerName(customer: {
  firstName: string | null;

  lastName: string | null;

  companyName: string | null;
}): string {
  if (customer.companyName) {
    return customer.companyName;
  }

  const name = [customer.firstName, customer.lastName]
    .filter(Boolean)
    .join(" ");

  return name || "Unknown";
}

//************************************************************** */

function formatVehicleDescription(vehicle: {
  year: number | null;

  make: string | null;

  model: string | null;
}): string {
  const description = [vehicle.year, vehicle.make, vehicle.model]
    .filter(
      (value) =>
        value !== null && value !== undefined && String(value).trim() !== "",
    )
    .join(" ");

  return description || "—";
}

//************************************************************** */
