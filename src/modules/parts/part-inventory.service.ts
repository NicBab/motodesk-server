import {
  PartInventoryTransactionType,
} from "../../generated/prisma/client.js";

import {
  AppError,
} from "../../platform/errors/app-error.js";

import {
  applyInventoryMutation,
  findInventoryTransactions,
  setInventoryCount,
} from "./part-inventory.repository.js";

import {
  findPartById,
} from "./part.repository.js";

import type {
  InventoryAdjustmentInput,
  InventoryAllocationInput,
  InventoryCycleCountInput,
  InventoryDamageInput,
  InventoryDeallocationInput,
  InventoryIssueInput,
  InventoryReceiptInput,
  InventoryReturnInput,
} from "./part-inventory.schemas.js";

//************************************************************** */

async function requirePart(
  organizationId: string,
  partId: string,
) {
  const part =
    await findPartById(
      organizationId,
      partId,
    );

  if (!part) {
    throw new AppError(
      404,
      "Part not found.",
      {
        code: "PART_NOT_FOUND",
      },
    );
  }

  return part;
}

//************************************************************** */

function decimalToNumber(
  value: {
    toString(): string;
  },
): number {
  return Number(
    value.toString(),
  );
}

//************************************************************** */

export async function adjustInventory(
  organizationId: string,
  partId: string,
  membershipId: string | null,
  input: InventoryAdjustmentInput,
) {
  const part =
    await requirePart(
      organizationId,
      partId,
    );

  const onHand =
    decimalToNumber(
      part.qtyOnHand,
    );

  const resultingOnHand =
    onHand +
    input.quantity;

  if (
    resultingOnHand < 0
  ) {
    throw new AppError(
      400,
      "Inventory adjustment would result in negative on-hand quantity.",
      {
        code:
          "INSUFFICIENT_ON_HAND_INVENTORY",
      },
    );
  }

  return applyInventoryMutation({
    partId,

    type:
      PartInventoryTransactionType.ADJUSTMENT,

    quantity:
      input.quantity,

    onHandDelta:
      input.quantity,

    ...(input.notes !== undefined
      ? {
          notes:
            input.notes,
        }
      : {}),

    createdByMembershipId:
      membershipId,
  });
}

//************************************************************** */

export async function receiveInventory(
  organizationId: string,
  partId: string,
  membershipId: string | null,
  input: InventoryReceiptInput,
) {
  await requirePart(
    organizationId,
    partId,
  );

  return applyInventoryMutation({
    partId,

    type:
      PartInventoryTransactionType.RECEIPT,

    quantity:
      input.quantity,

    onHandDelta:
      input.quantity,

    ...(input.referenceType !== undefined
      ? {
          referenceType:
            input.referenceType,
        }
      : {}),

    ...(input.referenceId !== undefined
      ? {
          referenceId:
            input.referenceId,
        }
      : {}),

    ...(input.notes !== undefined
      ? {
          notes:
            input.notes,
        }
      : {}),

    createdByMembershipId:
      membershipId,
  });
}

//************************************************************** */

export async function allocateInventory(
  organizationId: string,
  partId: string,
  membershipId: string | null,
  input: InventoryAllocationInput,
) {
  const part =
    await requirePart(
      organizationId,
      partId,
    );

  const onHand =
    decimalToNumber(
      part.qtyOnHand,
    );

  const allocated =
    decimalToNumber(
      part.qtyAllocated,
    );

  const available =
    onHand -
    allocated;

  if (
    input.quantity >
    available
  ) {
    throw new AppError(
      400,
      "Insufficient available inventory for allocation.",
      {
        code:
          "INSUFFICIENT_AVAILABLE_INVENTORY",
      },
    );
  }

  return applyInventoryMutation({
    partId,

    type:
      PartInventoryTransactionType.ALLOCATION,

    quantity:
      input.quantity,

    allocatedDelta:
      input.quantity,

    ...(input.referenceType !== undefined
      ? {
          referenceType:
            input.referenceType,
        }
      : {}),

    ...(input.referenceId !== undefined
      ? {
          referenceId:
            input.referenceId,
        }
      : {}),

    ...(input.notes !== undefined
      ? {
          notes:
            input.notes,
        }
      : {}),

    createdByMembershipId:
      membershipId,
  });
}

//************************************************************** */

export async function deallocateInventory(
  organizationId: string,
  partId: string,
  membershipId: string | null,
  input: InventoryDeallocationInput,
) {
  const part =
    await requirePart(
      organizationId,
      partId,
    );

  const allocated =
    decimalToNumber(
      part.qtyAllocated,
    );

  if (
    input.quantity >
    allocated
  ) {
    throw new AppError(
      400,
      "Cannot deallocate more inventory than is currently allocated.",
      {
        code:
          "INSUFFICIENT_ALLOCATED_INVENTORY",
      },
    );
  }

  return applyInventoryMutation({
    partId,

    type:
      PartInventoryTransactionType.DEALLOCATION,

    quantity:
      input.quantity,

    allocatedDelta:
      -input.quantity,

    ...(input.referenceType !== undefined
      ? {
          referenceType:
            input.referenceType,
        }
      : {}),

    ...(input.referenceId !== undefined
      ? {
          referenceId:
            input.referenceId,
        }
      : {}),

    ...(input.notes !== undefined
      ? {
          notes:
            input.notes,
        }
      : {}),

    createdByMembershipId:
      membershipId,
  });
}

//************************************************************** */

export async function issueInventory(
  organizationId: string,
  partId: string,
  membershipId: string | null,
  input: InventoryIssueInput,
) {
  const part =
    await requirePart(
      organizationId,
      partId,
    );

  const onHand =
    decimalToNumber(
      part.qtyOnHand,
    );

  const allocated =
    decimalToNumber(
      part.qtyAllocated,
    );

  if (
    input.quantity >
    allocated
  ) {
    throw new AppError(
      400,
      "Cannot issue more inventory than is currently allocated.",
      {
        code:
          "INSUFFICIENT_ALLOCATED_INVENTORY",
      },
    );
  }

  if (
    input.quantity >
    onHand
  ) {
    throw new AppError(
      400,
      "Insufficient on-hand inventory.",
      {
        code:
          "INSUFFICIENT_ON_HAND_INVENTORY",
      },
    );
  }

  return applyInventoryMutation({
    partId,

    type:
      PartInventoryTransactionType.ISSUE,

    quantity:
      input.quantity,

    onHandDelta:
      -input.quantity,

    allocatedDelta:
      -input.quantity,

    ...(input.referenceType !== undefined
      ? {
          referenceType:
            input.referenceType,
        }
      : {}),

    ...(input.referenceId !== undefined
      ? {
          referenceId:
            input.referenceId,
        }
      : {}),

    ...(input.notes !== undefined
      ? {
          notes:
            input.notes,
        }
      : {}),

    createdByMembershipId:
      membershipId,
  });
}

//************************************************************** */

export async function returnInventory(
  organizationId: string,
  partId: string,
  membershipId: string | null,
  input: InventoryReturnInput,
) {
  await requirePart(
    organizationId,
    partId,
  );

  return applyInventoryMutation({
    partId,

    type:
      PartInventoryTransactionType.RETURN,

    quantity:
      input.quantity,

    onHandDelta:
      input.quantity,

    ...(input.referenceType !== undefined
      ? {
          referenceType:
            input.referenceType,
        }
      : {}),

    ...(input.referenceId !== undefined
      ? {
          referenceId:
            input.referenceId,
        }
      : {}),

    ...(input.notes !== undefined
      ? {
          notes:
            input.notes,
        }
      : {}),

    createdByMembershipId:
      membershipId,
  });
}

//************************************************************** */

export async function damageInventory(
  organizationId: string,
  partId: string,
  membershipId: string | null,
  input: InventoryDamageInput,
) {
  const part =
    await requirePart(
      organizationId,
      partId,
    );

  const onHand =
    decimalToNumber(
      part.qtyOnHand,
    );

  const allocated =
    decimalToNumber(
      part.qtyAllocated,
    );

  const available =
    onHand -
    allocated;

  if (
    input.quantity >
    available
  ) {
    throw new AppError(
      400,
      "Cannot damage or write off inventory that is allocated or unavailable.",
      {
        code:
          "INSUFFICIENT_AVAILABLE_INVENTORY",
      },
    );
  }

  return applyInventoryMutation({
    partId,

    type:
      PartInventoryTransactionType.DAMAGE,

    quantity:
      input.quantity,

    onHandDelta:
      -input.quantity,

    ...(input.referenceType !== undefined
      ? {
          referenceType:
            input.referenceType,
        }
      : {}),

    ...(input.referenceId !== undefined
      ? {
          referenceId:
            input.referenceId,
        }
      : {}),

    ...(input.notes !== undefined
      ? {
          notes:
            input.notes,
        }
      : {}),

    createdByMembershipId:
      membershipId,
  });
}

//************************************************************** */

export async function cycleCountInventory(
  organizationId: string,
  partId: string,
  membershipId: string | null,
  input: InventoryCycleCountInput,
) {
  const part =
    await requirePart(
      organizationId,
      partId,
    );

  const allocated =
    decimalToNumber(
      part.qtyAllocated,
    );

  if (
    input.countedQuantity <
    allocated
  ) {
    throw new AppError(
      400,
      "Counted inventory cannot be lower than the currently allocated quantity.",
      {
        code:
          "COUNT_BELOW_ALLOCATED_INVENTORY",
      },
    );
  }

  return setInventoryCount(
    partId,
    input.countedQuantity,
    membershipId,
    input.notes,
  );
}

//************************************************************** */

export async function listInventoryTransactions(
  organizationId: string,
  partId: string,
) {
  await requirePart(
    organizationId,
    partId,
  );

  return findInventoryTransactions(
    partId,
  );
}