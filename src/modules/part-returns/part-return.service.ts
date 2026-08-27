import { AppError } from "../../platform/errors/app-error.js";

import { findPartById } from "../parts/part.repository.js";

import { findPurchaseOrderById } from "../purchase-orders/purchase-order.repository.js";

import { findRepairOrderById } from "../repair-orders/repair-order.repository.js";

import { findVendorById } from "../vendors/vendor.repository.js";

import {
  archivePartReturnRecord,
  closePartReturnToInventoryRecord,
  createPartReturnRecord,
  findPartReturnById,
  findPartReturnsByOrganization,
  recordPartReturnCreditRecord,
  updatePartReturnRecord,
  updatePartReturnStatusRecord,
} from "./part-return.repository.js";

import type { PartReturnSnapshot } from "./part-return.repository.js";

import type {
  CreatePartReturnInput,
  ListPartReturnsQueryInput,
  UpdatePartReturnCreditInput,
  UpdatePartReturnInput,
} from "./part-return.schemas.js";

//************************************************************** */

type PartReturnTypeValue =
  | "TO_VENDOR"
  | "TO_INVENTORY"
  | "WRONG_PART"
  | "DAMAGED"
  | "UNUSED_RO_PART"
  | "CORE_RETURN"
  | "WARRANTY_RETURN";

//************************************************************** */

function isInventoryReturnType(returnType: PartReturnTypeValue): boolean {
  return returnType === "TO_INVENTORY" || returnType === "UNUSED_RO_PART";
}

//************************************************************** */

function requiresVendor(returnType: PartReturnTypeValue): boolean {
  return !isInventoryReturnType(returnType);
}

//************************************************************** */

async function requirePart(organizationId: string, partId: string) {
  const part = await findPartById(organizationId, partId);

  if (!part) {
    throw new AppError(
      400,
      "The selected part does not belong to this organization.",
      {
        code: "PART_RETURN_PART_INVALID",
      },
    );
  }

  return part;
}

//************************************************************** */

async function requireVendor(organizationId: string, vendorId: string) {
  const vendor = await findVendorById(organizationId, vendorId);

  if (!vendor) {
    throw new AppError(
      400,
      "The selected vendor does not belong to this organization.",
      {
        code: "PART_RETURN_VENDOR_INVALID",
      },
    );
  }

  return vendor;
}

//************************************************************** */

async function requirePurchaseOrder(
  organizationId: string,
  purchaseOrderId: string,
) {
  const purchaseOrder = await findPurchaseOrderById(
    organizationId,
    purchaseOrderId,
  );

  if (!purchaseOrder) {
    throw new AppError(
      400,
      "The selected purchase order does not belong to this organization.",
      {
        code: "PART_RETURN_PURCHASE_ORDER_INVALID",
      },
    );
  }

  return purchaseOrder;
}

//************************************************************** */

async function requireRepairOrder(
  organizationId: string,
  repairOrderId: string,
) {
  const repairOrder = await findRepairOrderById(organizationId, repairOrderId);

  if (!repairOrder) {
    throw new AppError(
      400,
      "The selected repair order does not belong to this organization.",
      {
        code: "PART_RETURN_REPAIR_ORDER_INVALID",
      },
    );
  }

  return repairOrder;
}

//************************************************************** */

function purchaseOrderContainsPart(
  purchaseOrder: Awaited<ReturnType<typeof findPurchaseOrderById>>,
  part: {
    id: string;
    partNumber: string;
  },
): boolean {
  if (!purchaseOrder) {
    return false;
  }

  return purchaseOrder.lines.some(
    (line) =>
      line.partId === part.id ||
      (line.partId === null &&
        line.partNumber.trim().toLowerCase() ===
          part.partNumber.trim().toLowerCase()),
  );
}

//************************************************************** */

function repairOrderContainsPart(
  repairOrder: Awaited<ReturnType<typeof findRepairOrderById>>,
  partId: string,
): boolean {
  if (!repairOrder) {
    return false;
  }

  return repairOrder.partLines.some((line) => line.partId === partId);
}

//************************************************************** */

async function buildCreateSnapshot(
  organizationId: string,
  input: CreatePartReturnInput,
): Promise<PartReturnSnapshot> {
  const part = await requirePart(organizationId, input.partId);

  let vendorId: string | undefined;
  let vendorName: string | undefined;

  let purchaseOrderId: string | undefined;
  let poNumber: number | undefined;

  let repairOrderId: string | undefined;
  let roNumber: number | undefined;

  if (input.vendorId !== undefined) {
    const vendor = await requireVendor(organizationId, input.vendorId);

    vendorId = vendor.id;
    vendorName = vendor.name;
  }

  if (input.purchaseOrderId !== undefined) {
    const purchaseOrder = await requirePurchaseOrder(
      organizationId,
      input.purchaseOrderId,
    );

    if (!purchaseOrderContainsPart(purchaseOrder, part)) {
      throw new AppError(
        400,
        "The selected purchase order does not contain the returned part.",
        {
          code: "PART_RETURN_PURCHASE_ORDER_PART_MISMATCH",
        },
      );
    }

    if (vendorId !== undefined && vendorId !== purchaseOrder.vendorId) {
      throw new AppError(
        400,
        "The selected vendor does not match the purchase order vendor.",
        {
          code: "PART_RETURN_PURCHASE_ORDER_VENDOR_MISMATCH",
        },
      );
    }

    purchaseOrderId = purchaseOrder.id;

    poNumber = purchaseOrder.poNumber;

    vendorId = purchaseOrder.vendorId;

    vendorName = purchaseOrder.vendor.name;
  }

  if (input.repairOrderId !== undefined) {
    const repairOrder = await requireRepairOrder(
      organizationId,
      input.repairOrderId,
    );

    if (!repairOrderContainsPart(repairOrder, part.id)) {
      throw new AppError(
        400,
        "The selected repair order does not contain the returned part.",
        {
          code: "PART_RETURN_REPAIR_ORDER_PART_MISMATCH",
        },
      );
    }

    repairOrderId = repairOrder.id;

    roNumber = repairOrder.roNumber;
  }

  if (requiresVendor(input.returnType) && vendorId === undefined) {
    throw new AppError(400, "A vendor is required for this return type.", {
      code: "PART_RETURN_VENDOR_REQUIRED",
    });
  }

  return {
    partId: part.id,

    partNumber: part.partNumber,

    description: part.description,

    ...(vendorId !== undefined
      ? {
          vendorId,
        }
      : {}),

    ...(vendorName !== undefined
      ? {
          vendorName,
        }
      : {}),

    ...(purchaseOrderId !== undefined
      ? {
          purchaseOrderId,
        }
      : {}),

    ...(poNumber !== undefined
      ? {
          poNumber,
        }
      : {}),

    ...(repairOrderId !== undefined
      ? {
          repairOrderId,
        }
      : {}),

    ...(roNumber !== undefined
      ? {
          roNumber,
        }
      : {}),
  };
}

//************************************************************** */

export async function createPartReturn(
  organizationId: string,
  input: CreatePartReturnInput,
) {
  const snapshot = await buildCreateSnapshot(organizationId, input);

  return createPartReturnRecord(organizationId, input, snapshot);
}

//************************************************************** */

export async function getPartReturnById(
  organizationId: string,
  partReturnId: string,
) {
  const partReturn = await findPartReturnById(organizationId, partReturnId);

  if (!partReturn) {
    throw new AppError(404, "Part return not found.", {
      code: "PART_RETURN_NOT_FOUND",
    });
  }

  return partReturn;
}

//************************************************************** */

export async function listPartReturns(
  organizationId: string,
  query: ListPartReturnsQueryInput,
) {
  return findPartReturnsByOrganization(organizationId, query);
}

//************************************************************** */

export async function updatePartReturn(
  organizationId: string,
  partReturnId: string,
  input: UpdatePartReturnInput,
) {
  const existing = await getPartReturnById(organizationId, partReturnId);

  if (existing.status !== "PENDING") {
    throw new AppError(400, "Only pending part returns can be edited.", {
      code: "PART_RETURN_NOT_EDITABLE",
    });
  }

  const normalizedInput: UpdatePartReturnInput = {
    ...input,
  };

  const snapshot: Partial<PartReturnSnapshot> = {};

  const part = existing.partId
    ? await requirePart(organizationId, existing.partId)
    : null;

  if (input.vendorId !== undefined) {
    if (input.vendorId !== null) {
      const vendor = await requireVendor(organizationId, input.vendorId);

      snapshot.vendorName = vendor.name;
    }
  }

  if (input.purchaseOrderId !== undefined && input.purchaseOrderId !== null) {
    if (!part) {
      throw new AppError(
        400,
        "The returned part no longer exists and cannot be linked to a purchase order.",
        {
          code: "PART_RETURN_PART_MISSING",
        },
      );
    }

    const purchaseOrder = await requirePurchaseOrder(
      organizationId,
      input.purchaseOrderId,
    );

    if (!purchaseOrderContainsPart(purchaseOrder, part)) {
      throw new AppError(
        400,
        "The selected purchase order does not contain the returned part.",
        {
          code: "PART_RETURN_PURCHASE_ORDER_PART_MISMATCH",
        },
      );
    }

    if (
      input.vendorId !== undefined &&
      input.vendorId !== null &&
      input.vendorId !== purchaseOrder.vendorId
    ) {
      throw new AppError(
        400,
        "The selected vendor does not match the purchase order vendor.",
        {
          code: "PART_RETURN_PURCHASE_ORDER_VENDOR_MISMATCH",
        },
      );
    }

    snapshot.poNumber = purchaseOrder.poNumber;

    snapshot.vendorName = purchaseOrder.vendor.name;

    normalizedInput.vendorId = purchaseOrder.vendorId;
  }

  if (input.repairOrderId !== undefined && input.repairOrderId !== null) {
    if (!part) {
      throw new AppError(
        400,
        "The returned part no longer exists and cannot be linked to a repair order.",
        {
          code: "PART_RETURN_PART_MISSING",
        },
      );
    }

    const repairOrder = await requireRepairOrder(
      organizationId,
      input.repairOrderId,
    );

    if (!repairOrderContainsPart(repairOrder, part.id)) {
      throw new AppError(
        400,
        "The selected repair order does not contain the returned part.",
        {
          code: "PART_RETURN_REPAIR_ORDER_PART_MISMATCH",
        },
      );
    }

    snapshot.roNumber = repairOrder.roNumber;
  }

  const finalReturnType = normalizedInput.returnType ?? existing.returnType;

  const finalVendorId =
    normalizedInput.vendorId !== undefined
      ? normalizedInput.vendorId
      : existing.vendorId;

  const finalPurchaseOrderId =
    normalizedInput.purchaseOrderId !== undefined
      ? normalizedInput.purchaseOrderId
      : existing.purchaseOrderId;

  if (finalPurchaseOrderId && finalVendorId) {
    const purchaseOrder = await requirePurchaseOrder(
      organizationId,
      finalPurchaseOrderId,
    );

    if (purchaseOrder.vendorId !== finalVendorId) {
      throw new AppError(
        400,
        "The return vendor does not match the linked purchase order vendor.",
        {
          code: "PART_RETURN_PURCHASE_ORDER_VENDOR_MISMATCH",
        },
      );
    }
  }

  if (requiresVendor(finalReturnType) && !finalVendorId) {
    throw new AppError(400, "A vendor is required for this return type.", {
      code: "PART_RETURN_VENDOR_REQUIRED",
    });
  }

  await updatePartReturnRecord(
    organizationId,
    partReturnId,
    normalizedInput,
    snapshot,
  );

  return getPartReturnById(organizationId, partReturnId);
}

//************************************************************** */

export async function shipPartReturn(
  organizationId: string,
  partReturnId: string,
) {
  const partReturn = await getPartReturnById(organizationId, partReturnId);

  if (partReturn.status !== "PENDING") {
    throw new AppError(400, "Only pending part returns can be shipped.", {
      code: "PART_RETURN_NOT_SHIPPABLE",
    });
  }

  if (isInventoryReturnType(partReturn.returnType)) {
    throw new AppError(
      400,
      "Returns to inventory are not shipped to a vendor.",
      {
        code: "PART_RETURN_INVENTORY_NOT_SHIPPABLE",
      },
    );
  }

  if (!partReturn.vendorId) {
    throw new AppError(
      400,
      "A vendor is required before this return can be shipped.",
      {
        code: "PART_RETURN_VENDOR_REQUIRED",
      },
    );
  }

  await updatePartReturnStatusRecord(organizationId, partReturnId, "SHIPPED");

  return getPartReturnById(organizationId, partReturnId);
}

//************************************************************** */

export async function updatePartReturnCredit(
  organizationId: string,
  partReturnId: string,
  input: UpdatePartReturnCreditInput,
) {
  const partReturn = await getPartReturnById(organizationId, partReturnId);

  if (partReturn.status !== "SHIPPED") {
    throw new AppError(
      400,
      "Credit can only be recorded for a shipped part return.",
      {
        code: "PART_RETURN_NOT_AWAITING_CREDIT",
      },
    );
  }

  if (isInventoryReturnType(partReturn.returnType)) {
    throw new AppError(
      400,
      "Returns to inventory do not use vendor credit processing.",
      {
        code: "PART_RETURN_INVENTORY_CREDIT_INVALID",
      },
    );
  }

  const result = await recordPartReturnCreditRecord(
    organizationId,
    partReturnId,
    input,
  );

  if (result.count !== 1) {
    throw new AppError(
      409,
      "The part return status changed before the credit could be recorded.",
      {
        code: "PART_RETURN_CREDIT_CONFLICT",
      },
    );
  }

  return getPartReturnById(organizationId, partReturnId);
}

//************************************************************** */

export async function closePartReturn(
  organizationId: string,
  partReturnId: string,
  membershipId: string | null,
) {
  const partReturn = await getPartReturnById(organizationId, partReturnId);

  if (isInventoryReturnType(partReturn.returnType)) {
    if (partReturn.status !== "PENDING") {
      throw new AppError(
        400,
        "Only pending inventory returns can be returned to stock.",
        {
          code: "PART_RETURN_INVENTORY_NOT_CLOSABLE",
        },
      );
    }

    if (!partReturn.partId) {
      throw new AppError(
        400,
        "The returned part no longer exists and cannot be returned to inventory.",
        {
          code: "PART_RETURN_PART_MISSING",
        },
      );
    }

    const result = await closePartReturnToInventoryRecord(
      organizationId,
      partReturnId,
      membershipId,
    );

    if (!result) {
      throw new AppError(
        409,
        "The part return changed before it could be returned to inventory.",
        {
          code: "PART_RETURN_INVENTORY_CLOSE_CONFLICT",
        },
      );
    }

    return result;
  }

  if (partReturn.status !== "CREDITED") {
    throw new AppError(
      400,
      "Vendor returns must be credited before they can be closed.",
      {
        code: "PART_RETURN_NOT_CLOSABLE",
      },
    );
  }

  await updatePartReturnStatusRecord(organizationId, partReturnId, "CLOSED");

  return getPartReturnById(organizationId, partReturnId);
}

//************************************************************** */

export async function archivePartReturn(
  organizationId: string,
  partReturnId: string,
) {
  const partReturn = await getPartReturnById(organizationId, partReturnId);

  if (!partReturn.isActive) {
    throw new AppError(400, "Part return is already archived.", {
      code: "PART_RETURN_ALREADY_ARCHIVED",
    });
  }

  if (partReturn.status !== "CLOSED") {
    throw new AppError(
      400,
      "A part return must be closed before it can be archived.",
      {
        code: "PART_RETURN_NOT_CLOSED",
      },
    );
  }

  await archivePartReturnRecord(organizationId, partReturnId);

  return getPartReturnById(organizationId, partReturnId);
}

//************************************************************** */
