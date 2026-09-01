import { AppError } from "../../platform/errors/app-error.js";

import { findPartById } from "../parts/part.repository.js";

import { findRepairOrderPartLineByIdOnly } from "../repair-orders/repair-order-part.repository.js";

import { findVendorById } from "../vendors/vendor.repository.js";

import {
  createPurchaseOrderRecord,
  findPurchaseOrderById,
  findPurchaseOrdersByOrganization,
  orderPurchaseOrderRecord,
  updatePurchaseOrderRecord,
  receivePurchaseOrderRecord,
  cancelPurchaseOrderRecord,
} from "./purchase-order.repository.js";

import type { PurchaseOrderLineSnapshot } from "./purchase-order.repository.js";

import type {
  CreatePurchaseOrderInput,
  PurchaseOrderLineInput,
  ListPurchaseOrdersQueryInput,
  UpdatePurchaseOrderInput,
  ReceivePurchaseOrderInput,
  CancelPurchaseOrderInput,
} from "./purchase-order.schemas.js";

import { evaluateRepairOrderReadiness } from "../repair-orders/repair-order.service.js";

//************************************************************** */

async function requireActiveVendor(organizationId: string, vendorId: string) {
  const vendor = await findVendorById(organizationId, vendorId);

  if (!vendor) {
    throw new AppError(
      400,
      "The selected vendor does not belong to this organization.",
      {
        code: "PURCHASE_ORDER_VENDOR_INVALID",
      },
    );
  }

  if (!vendor.isActive) {
    throw new AppError(400, "The selected vendor is archived.", {
      code: "PURCHASE_ORDER_VENDOR_ARCHIVED",
    });
  }

  return vendor;
}

//************************************************************** */

async function buildLineSnapshots(
  organizationId: string,
  lines: PurchaseOrderLineInput[],
): Promise<PurchaseOrderLineSnapshot[]> {
  const snapshots: PurchaseOrderLineSnapshot[] = [];

  for (const line of lines) {
    if (!line.partId) {
      if (line.repairOrderPartLineId !== undefined) {
        const repairOrderPartLine = await findRepairOrderPartLineByIdOnly(
          organizationId,
          line.repairOrderPartLineId,
        );

        if (!repairOrderPartLine) {
          throw new AppError(
            400,
            "The selected repair order part line is invalid.",
            {
              code: "PURCHASE_ORDER_REPAIR_ORDER_PART_LINE_INVALID",
            },
          );
        }

        snapshots.push({
          repairOrderPartLineId: repairOrderPartLine.id,
          partNumber: repairOrderPartLine.partNumber,
          description: repairOrderPartLine.description,
          orderedQty: line.orderedQty,
          unitCost: line.unitCost,
        });

        continue;
      }

      snapshots.push({
        partNumber: line.partNumber!.trim(),
        description: line.description!.trim(),
        orderedQty: line.orderedQty,
        unitCost: line.unitCost,
      });

      continue;
    }

    const part = await findPartById(organizationId, line.partId);

    if (!part) {
      throw new AppError(
        400,
        "A selected purchase order part does not belong to this organization.",
        {
          code: "PURCHASE_ORDER_PART_INVALID",
        },
      );
    }

    if (!part.isActive) {
      throw new AppError(400, "A selected purchase order part is archived.", {
        code: "PURCHASE_ORDER_PART_ARCHIVED",
      });
    }

    if (line.repairOrderPartLineId !== undefined) {
      const repairOrderPartLine = await findRepairOrderPartLineByIdOnly(
        organizationId,
        line.repairOrderPartLineId,
      );

      if (!repairOrderPartLine) {
        throw new AppError(
          400,
          "The selected repair order part line is invalid.",
          {
            code: "PURCHASE_ORDER_REPAIR_ORDER_PART_LINE_INVALID",
          },
        );
      }

      if (
        repairOrderPartLine.partId !== null &&
        repairOrderPartLine.partId !== line.partId
      ) {
        throw new AppError(
          400,
          "The purchase order part does not match the linked repair order part line.",
          {
            code: "PURCHASE_ORDER_PART_LINE_MISMATCH",
          },
        );
      }
    }

    snapshots.push({
      partId: part.id,
      ...(line.repairOrderPartLineId !== undefined
        ? {
            repairOrderPartLineId: line.repairOrderPartLineId,
          }
        : {}),
      partNumber: part.partNumber,
      description: part.description,
      orderedQty: line.orderedQty,
      unitCost: line.unitCost,
    });
  }

  return snapshots;
}

//************************************************************** */

export async function createPurchaseOrder(
  organizationId: string,
  input: CreatePurchaseOrderInput,
) {
  await requireActiveVendor(organizationId, input.vendorId);

  const lines = await buildLineSnapshots(organizationId, input.lines);

  return createPurchaseOrderRecord(organizationId, input, lines);
}

//************************************************************** */

export async function getPurchaseOrderById(
  organizationId: string,
  purchaseOrderId: string,
) {
  const purchaseOrder = await findPurchaseOrderById(
    organizationId,
    purchaseOrderId,
  );

  if (!purchaseOrder) {
    throw new AppError(404, "Purchase order not found.", {
      code: "PURCHASE_ORDER_NOT_FOUND",
    });
  }

  return purchaseOrder;
}

//************************************************************** */

export async function listPurchaseOrders(
  organizationId: string,
  query: ListPurchaseOrdersQueryInput,
) {
  return findPurchaseOrdersByOrganization(organizationId, query);
}

//************************************************************** */

export async function orderPurchaseOrder(
  organizationId: string,
  purchaseOrderId: string,
  membershipId: string | null,
) {
  const purchaseOrder = await getPurchaseOrderById(
    organizationId,
    purchaseOrderId,
  );

  if (purchaseOrder.status !== "DRAFT") {
    throw new AppError(400, "Only draft purchase orders can be ordered.", {
      code: "PURCHASE_ORDER_NOT_DRAFT",
    });
  }

  if (purchaseOrder.lines.length === 0) {
    throw new AppError(
      400,
      "A purchase order must contain at least one line before it can be ordered.",
      {
        code: "PURCHASE_ORDER_LINES_REQUIRED",
      },
    );
  }

  const result = await orderPurchaseOrderRecord(
    organizationId,
    purchaseOrderId,
    membershipId,
  );

  if (!result || !result.purchaseOrder) {
    throw new AppError(400, "Purchase order could not be ordered.", {
      code: "PURCHASE_ORDER_ORDER_FAILED",
    });
  }

  if (result.alreadyOrdered) {
    throw new AppError(400, "Purchase order has already been ordered.", {
      code: "PURCHASE_ORDER_ALREADY_ORDERED",
    });
  }

  return result.purchaseOrder;
}

//************************************************************** */

export async function receivePurchaseOrder(
  organizationId: string,
  purchaseOrderId: string,
  membershipId: string | null,
  input: ReceivePurchaseOrderInput,
) {
  const purchaseOrder = await getPurchaseOrderById(
    organizationId,
    purchaseOrderId,
  );

  if (
    purchaseOrder.status !== "ORDERED" &&
    purchaseOrder.status !== "PARTIALLY_RECEIVED"
  ) {
    throw new AppError(
      400,
      "Only ordered purchase orders can receive parts.",
      {
        code: "PURCHASE_ORDER_NOT_RECEIVABLE",
      },
    );
  }

  const result = await receivePurchaseOrderRecord(
    organizationId,
    purchaseOrderId,
    input,
    membershipId,
  );

  if (!result) {
    throw new AppError(404, "Purchase order not found.", {
      code: "PURCHASE_ORDER_NOT_FOUND",
    });
  }

  if (result.lineNotFound) {
    throw new AppError(400, "Purchase order line not found.", {
      code: "PURCHASE_ORDER_LINE_NOT_FOUND",
    });
  }

  if (result.exceedsRemaining) {
    throw new AppError(
      400,
      "Received quantity exceeds the remaining ordered quantity.",
      {
        code: "PURCHASE_ORDER_RECEIPT_EXCEEDS_REMAINING",
      },
    );
  }

  if (result.inventoryFailed) {
    throw new AppError(400, "Purchase order inventory receipt failed.", {
      code: "PURCHASE_ORDER_RECEIPT_FAILED",
    });
  }

  if (!result.purchaseOrder || !result.receiptId) {
    throw new AppError(400, "Purchase order receipt could not be completed.", {
      code: "PURCHASE_ORDER_RECEIPT_FAILED",
    });
  }

  const linkedRepairOrderIds = new Set<string>();

  for (const line of result.purchaseOrder.lines) {
    if (line.repairOrderPartLine?.repairOrderId) {
      linkedRepairOrderIds.add(line.repairOrderPartLine.repairOrderId);
    }
  }

  for (const repairOrderId of linkedRepairOrderIds) {
    await evaluateRepairOrderReadiness(organizationId, repairOrderId);
  }

  return result.purchaseOrder;
}

//************************************************************** */

export async function cancelPurchaseOrder(
  organizationId: string,
  purchaseOrderId: string,
  membershipId: string | null,
  input: CancelPurchaseOrderInput,
) {
  const purchaseOrder = await getPurchaseOrderById(
    organizationId,
    purchaseOrderId,
  );

  if (
    purchaseOrder.status !== "ORDERED" &&
    purchaseOrder.status !== "PARTIALLY_RECEIVED"
  ) {
    throw new AppError(
      400,
      "Only ordered or partially received purchase orders can be cancelled.",
      {
        code: "PURCHASE_ORDER_NOT_CANCELLABLE",
      },
    );
  }

  const result = await cancelPurchaseOrderRecord(
    organizationId,
    purchaseOrderId,
    membershipId,
    input.notes,
  );

  if (!result) {
    throw new AppError(404, "Purchase order not found.", {
      code: "PURCHASE_ORDER_NOT_FOUND",
    });
  }

  if ("notCancellable" in result && result.notCancellable) {
    throw new AppError(
      400,
      "Purchase order cannot be cancelled in its current status.",
      {
        code: "PURCHASE_ORDER_NOT_CANCELLABLE",
      },
    );
  }

  if ("inventoryFailed" in result && result.inventoryFailed) {
    throw new AppError(
      400,
      "Purchase order cancellation could not update inventory.",
      {
        code: "PURCHASE_ORDER_CANCELLATION_FAILED",
      },
    );
  }

  if (!result.purchaseOrder) {
    throw new AppError(
      400,
      "Purchase order cancellation could not be completed.",
      {
        code: "PURCHASE_ORDER_CANCELLATION_FAILED",
      },
    );
  }

  return result.purchaseOrder;
}

//************************************************************** */

export async function updatePurchaseOrder(
  organizationId: string,
  purchaseOrderId: string,
  input: UpdatePurchaseOrderInput,
) {
  const existingPurchaseOrder = await getPurchaseOrderById(
    organizationId,
    purchaseOrderId,
  );

  if (existingPurchaseOrder.status !== "DRAFT") {
    throw new AppError(400, "Only draft purchase orders can be edited.", {
      code: "PURCHASE_ORDER_NOT_EDITABLE",
    });
  }

  if (input.vendorId !== undefined) {
    await requireActiveVendor(organizationId, input.vendorId);
  }

  const lines =
    input.lines !== undefined
      ? await buildLineSnapshots(organizationId, input.lines)
      : undefined;

  const updatedPurchaseOrder = await updatePurchaseOrderRecord(
    organizationId,
    purchaseOrderId,
    input,
    lines,
  );

  if (!updatedPurchaseOrder) {
    throw new AppError(409, "Purchase order changed before it could be edited.", {
      code: "PURCHASE_ORDER_EDIT_CONFLICT",
    });
  }

  return updatedPurchaseOrder;
}
