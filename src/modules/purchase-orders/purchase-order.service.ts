import {
  AppError,
} from "../../platform/errors/app-error.js";

import {
  findPartById,
} from "../parts/part.repository.js";

import {
  findRepairOrderPartLineByIdOnly,
} from "../repair-orders/repair-order-part.repository.js";

import {
  findVendorById,
} from "../vendors/vendor.repository.js";

import {
  createPurchaseOrderRecord,
  findPurchaseOrderById,
  findPurchaseOrdersByOrganization,
  updatePurchaseOrderRecord,
} from "./purchase-order.repository.js";

import type {
  PurchaseOrderLineSnapshot,
} from "./purchase-order.repository.js";

import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQueryInput,
  UpdatePurchaseOrderInput,
} from "./purchase-order.schemas.js";

//************************************************************** */

async function requireActiveVendor(
  organizationId: string,
  vendorId: string,
) {
  const vendor =
    await findVendorById(
      organizationId,
      vendorId,
    );

  if (!vendor) {
    throw new AppError(
      400,
      "The selected vendor does not belong to this organization.",
      {
        code:
          "PURCHASE_ORDER_VENDOR_INVALID",
      },
    );
  }

  if (!vendor.isActive) {
    throw new AppError(
      400,
      "The selected vendor is archived.",
      {
        code:
          "PURCHASE_ORDER_VENDOR_ARCHIVED",
      },
    );
  }

  return vendor;
}

//************************************************************** */

async function buildLineSnapshots(
  organizationId: string,
  input: CreatePurchaseOrderInput,
): Promise<PurchaseOrderLineSnapshot[]> {
  const snapshots:
    PurchaseOrderLineSnapshot[] = [];

  for (const line of input.lines) {
    const part =
      await findPartById(
        organizationId,
        line.partId,
      );

    if (!part) {
      throw new AppError(
        400,
        "A selected purchase order part does not belong to this organization.",
        {
          code:
            "PURCHASE_ORDER_PART_INVALID",
        },
      );
    }

    if (!part.isActive) {
      throw new AppError(
        400,
        "A selected purchase order part is archived.",
        {
          code:
            "PURCHASE_ORDER_PART_ARCHIVED",
        },
      );
    }

if (
  line.repairOrderPartLineId !==
  undefined
) {
  const repairOrderPartLine =
    await findRepairOrderPartLineByIdOnly(
      organizationId,
      line.repairOrderPartLineId,
    );

  if (!repairOrderPartLine) {
    throw new AppError(
      400,
      "The selected repair order part line is invalid.",
      {
        code:
          "PURCHASE_ORDER_REPAIR_ORDER_PART_LINE_INVALID",
      },
    );
  }

  if (
    repairOrderPartLine.partId !==
    line.partId
  ) {
    throw new AppError(
      400,
      "The purchase order part does not match the linked repair order part line.",
      {
        code:
          "PURCHASE_ORDER_PART_LINE_MISMATCH",
      },
    );
  }
}

    snapshots.push({
      partId:
        part.id,

      ...(line.repairOrderPartLineId !==
      undefined
        ? {
            repairOrderPartLineId:
              line.repairOrderPartLineId,
          }
        : {}),

      partNumber:
        part.partNumber,

      description:
        part.description,

      orderedQty:
        line.orderedQty,

      unitCost:
        line.unitCost,
    });
  }

  return snapshots;
}

//************************************************************** */

export async function createPurchaseOrder(
  organizationId: string,
  input: CreatePurchaseOrderInput,
) {
  await requireActiveVendor(
    organizationId,
    input.vendorId,
  );

  const lines =
    await buildLineSnapshots(
      organizationId,
      input,
    );

  return createPurchaseOrderRecord(
    organizationId,
    input,
    lines,
  );
}

//************************************************************** */

export async function getPurchaseOrderById(
  organizationId: string,
  purchaseOrderId: string,
) {
  const purchaseOrder =
    await findPurchaseOrderById(
      organizationId,
      purchaseOrderId,
    );

  if (!purchaseOrder) {
    throw new AppError(
      404,
      "Purchase order not found.",
      {
        code:
          "PURCHASE_ORDER_NOT_FOUND",
      },
    );
  }

  return purchaseOrder;
}

//************************************************************** */

export async function listPurchaseOrders(
  organizationId: string,
  query: ListPurchaseOrdersQueryInput,
) {
  return findPurchaseOrdersByOrganization(
    organizationId,
    query,
  );
}

//************************************************************** */

export async function updatePurchaseOrder(
  organizationId: string,
  purchaseOrderId: string,
  input: UpdatePurchaseOrderInput,
) {
  const existingPurchaseOrder =
    await getPurchaseOrderById(
      organizationId,
      purchaseOrderId,
    );

  if (
    existingPurchaseOrder.status !==
    "DRAFT"
  ) {
    throw new AppError(
      400,
      "Only draft purchase orders can be edited.",
      {
        code:
          "PURCHASE_ORDER_NOT_EDITABLE",
      },
    );
  }

  if (
    input.vendorId !== undefined
  ) {
    await requireActiveVendor(
      organizationId,
      input.vendorId,
    );
  }

  await updatePurchaseOrderRecord(
    organizationId,
    purchaseOrderId,
    input,
  );

  return getPurchaseOrderById(
    organizationId,
    purchaseOrderId,
  );
}