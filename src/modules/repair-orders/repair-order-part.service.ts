import {
  AppError,
} from "../../platform/errors/app-error.js";

import {
  findPartById,
} from "../parts/part.repository.js";

import {
  getRepairOrderById,
} from "./repair-order.service.js";

import {
  allocateRepairOrderPartLineRecord,
  createRepairOrderPartLineRecord,
  deallocateRepairOrderPartLineRecord,
  deleteRepairOrderPartLineRecord,
  findRepairOrderPartLineById,
  findRepairOrderPartLines,
  updateRepairOrderPartLineRecord,
  issueRepairOrderPartLineRecord,
  installRepairOrderPartLineRecord,
  markRepairOrderPartToBeOrderedRecord,
  pullRepairOrderPartRecord,
  stageRepairOrderPartRecord
} from "./repair-order-part.repository.js";

import type {
  AllocateRepairOrderPartInput,
  CreateRepairOrderPartLineInput,
  DeallocateRepairOrderPartInput,
  UpdateRepairOrderPartLineInput,
  IssueRepairOrderPartInput,
  InstallRepairOrderPartInput,
  MarkRepairOrderPartToBeOrderedInput,
  PullRepairOrderPartInput,
  StageRepairOrderPartInput
} from "./repair-order-part.schemas.js";

//************************************************************** */

async function assertPartValid(
  organizationId: string,
  partId: string,
): Promise<void> {
  const part =
    await findPartById(
      organizationId,
      partId,
    );

  if (!part) {
    throw new AppError(
      400,
      "The selected part does not belong to this organization.",
      {
        code:
          "REPAIR_ORDER_PART_INVALID",
      },
    );
  }

  if (!part.isActive) {
    throw new AppError(
      400,
      "The selected part is archived.",
      {
        code:
          "REPAIR_ORDER_PART_ARCHIVED",
      },
    );
  }
}

//************************************************************** */

export async function createRepairOrderPartLine(
  organizationId: string,
  repairOrderId: string,
  input: CreateRepairOrderPartLineInput,
) {
  await getRepairOrderById(
    organizationId,
    repairOrderId,
  );

  if (input.partId) {
    await assertPartValid(
      organizationId,
      input.partId,
    );
  }

  return createRepairOrderPartLineRecord(
    repairOrderId,
    input,
  );
}

//************************************************************** */

export async function listRepairOrderPartLines(
  organizationId: string,
  repairOrderId: string,
) {
  await getRepairOrderById(
    organizationId,
    repairOrderId,
  );

  return findRepairOrderPartLines(
    repairOrderId,
  );
}

//************************************************************** */

export async function getRepairOrderPartLineById(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
) {
  await getRepairOrderById(
    organizationId,
    repairOrderId,
  );

  const partLine =
    await findRepairOrderPartLineById(
      repairOrderId,
      partLineId,
    );

  if (!partLine) {
    throw new AppError(
      404,
      "Repair order part line not found.",
      {
        code:
          "REPAIR_ORDER_PART_LINE_NOT_FOUND",
      },
    );
  }

  return partLine;
}

//************************************************************** */

export async function updateRepairOrderPartLine(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
  input: UpdateRepairOrderPartLineInput,
) {
  await getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );

  await updateRepairOrderPartLineRecord(
    repairOrderId,
    partLineId,
    input,
  );

  return getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );
}

//************************************************************** */

export async function allocateRepairOrderPartLine(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
  membershipId: string | null,
  input: AllocateRepairOrderPartInput,
) {
  const partLine =
    await getRepairOrderPartLineById(
      organizationId,
      repairOrderId,
      partLineId,
    );

  if (!partLine.partId) {
    throw new AppError(
      400,
      "This repair order part line is not linked to an inventory part.",
      {
        code:
          "REPAIR_ORDER_PART_LINE_NOT_INVENTORY_BACKED",
      },
    );
  }

  const requiredQty =
    Number(
      partLine.requiredQty.toString(),
    );

  const allocatedQty =
    Number(
      partLine.allocatedQty.toString(),
    );

  const remainingQty =
    requiredQty -
    allocatedQty;

  if (
    input.quantity >
    remainingQty
  ) {
    throw new AppError(
      400,
      "Allocation quantity exceeds the remaining required quantity.",
      {
        code:
          "REPAIR_ORDER_PART_ALLOCATION_EXCEEDS_REQUIRED",
      },
    );
  }

  const part =
    await findPartById(
      organizationId,
      partLine.partId,
    );

  if (!part) {
    throw new AppError(
      400,
      "The linked inventory part is no longer available.",
      {
        code:
          "REPAIR_ORDER_PART_INVALID",
      },
    );
  }

  const onHand =
    Number(
      part.qtyOnHand.toString(),
    );

  const allocated =
    Number(
      part.qtyAllocated.toString(),
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
      "Insufficient available inventory for this repair order.",
      {
        code:
          "INSUFFICIENT_AVAILABLE_INVENTORY",
      },
    );
  }

  const result =
    await allocateRepairOrderPartLineRecord(
      repairOrderId,
      partLineId,
      partLine.partId,
      input.quantity,
      allocatedQty,
      membershipId,
      input.notes,
    );

  if (!result) {
    throw new AppError(
      400,
      "Inventory allocation failed.",
      {
        code:
          "REPAIR_ORDER_PART_ALLOCATION_FAILED",
      },
    );
  }

  return getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );
}

//************************************************************** */

export async function deallocateRepairOrderPartLine(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
  membershipId: string | null,
  input: DeallocateRepairOrderPartInput,
) {
  const partLine =
    await getRepairOrderPartLineById(
      organizationId,
      repairOrderId,
      partLineId,
    );

  if (!partLine.partId) {
    throw new AppError(
      400,
      "This repair order part line is not linked to an inventory part.",
      {
        code:
          "REPAIR_ORDER_PART_LINE_NOT_INVENTORY_BACKED",
      },
    );
  }

  const allocatedQty =
    Number(
      partLine.allocatedQty.toString(),
    );

  if (allocatedQty <= 0) {
    throw new AppError(
      400,
      "This repair order part line has no allocated inventory to release.",
      {
        code:
          "REPAIR_ORDER_PART_NOT_ALLOCATED",
      },
    );
  }

  if (
    input.quantity >
    allocatedQty
  ) {
    throw new AppError(
      400,
      "Deallocation quantity exceeds the quantity currently allocated.",
      {
        code:
          "REPAIR_ORDER_PART_DEALLOCATION_EXCEEDS_ALLOCATED",
      },
    );
  }

  const result =
    await deallocateRepairOrderPartLineRecord(
      repairOrderId,
      partLineId,
      partLine.partId,
      input.quantity,
      allocatedQty,
      membershipId,
      input.notes,
    );

  if (!result) {
    throw new AppError(
      400,
      "Inventory deallocation failed.",
      {
        code:
          "REPAIR_ORDER_PART_DEALLOCATION_FAILED",
      },
    );
  }

  return getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );
}

//************************************************************** */

export async function issueRepairOrderPartLine(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
  membershipId: string | null,
  input: IssueRepairOrderPartInput,
) {
  const partLine =
    await getRepairOrderPartLineById(
      organizationId,
      repairOrderId,
      partLineId,
    );

  if (!partLine.partId) {
    throw new AppError(
      400,
      "This repair order part line is not linked to an inventory part.",
      {
        code:
          "REPAIR_ORDER_PART_LINE_NOT_INVENTORY_BACKED",
      },
    );
  }

  const allocatedQty =
    Number(
      partLine.allocatedQty.toString(),
    );

  const pulledQty =
    Number(
      partLine.pulledQty.toString(),
    );

  if (allocatedQty <= 0) {
    throw new AppError(
      400,
      "This repair order part line has no allocated inventory to issue.",
      {
        code:
          "REPAIR_ORDER_PART_NOT_ALLOCATED",
      },
    );
  }

  if (
    input.quantity >
    allocatedQty
  ) {
    throw new AppError(
      400,
      "Issue quantity exceeds the quantity allocated to this repair order part line.",
      {
        code:
          "REPAIR_ORDER_PART_ISSUE_EXCEEDS_ALLOCATED",
      },
    );
  }

  const result =
    await issueRepairOrderPartLineRecord(
      repairOrderId,
      partLineId,
      partLine.partId,
      input.quantity,
      allocatedQty,
      pulledQty,
      membershipId,
      input.notes,
    );

  if (!result) {
    throw new AppError(
      400,
      "Inventory issue failed.",
      {
        code:
          "REPAIR_ORDER_PART_ISSUE_FAILED",
      },
    );
  }

  return getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );
}

//************************************************************** */

export async function installRepairOrderPartLine(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
  input: InstallRepairOrderPartInput,
) {
  const partLine =
    await getRepairOrderPartLineById(
      organizationId,
      repairOrderId,
      partLineId,
    );

  const pulledQty =
    Number(
      partLine.pulledQty.toString(),
    );

  const installedQty =
    Number(
      partLine.installedQty.toString(),
    );

  const requiredQty =
    Number(
      partLine.requiredQty.toString(),
    );

  const availableToInstall =
    pulledQty -
    installedQty;

  if (availableToInstall <= 0) {
    throw new AppError(
      400,
      "This repair order part line has no issued inventory available to install.",
      {
        code:
          "REPAIR_ORDER_PART_NOT_AVAILABLE_TO_INSTALL",
      },
    );
  }

  if (
    input.quantity >
    availableToInstall
  ) {
    throw new AppError(
      400,
      "Install quantity exceeds the issued quantity available for installation.",
      {
        code:
          "REPAIR_ORDER_PART_INSTALL_EXCEEDS_ISSUED",
      },
    );
  }

  await installRepairOrderPartLineRecord(
    repairOrderId,
    partLineId,
    input.quantity,
    installedQty,
    requiredQty,
  );

  return getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );
}

//************************************************************** */

export async function markRepairOrderPartToBeOrdered(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
  input: MarkRepairOrderPartToBeOrderedInput,
) {
  const partLine =
    await getRepairOrderPartLineById(
      organizationId,
      repairOrderId,
      partLineId,
    );

  const allocatedQty =
    Number(
      partLine.allocatedQty.toString(),
    );

  const pulledQty =
    Number(
      partLine.pulledQty.toString(),
    );

  const installedQty =
    Number(
      partLine.installedQty.toString(),
    );

  if (
    allocatedQty > 0 ||
    pulledQty > 0 ||
    installedQty > 0
  ) {
    throw new AppError(
      400,
      "Cannot mark a part line for ordering while inventory is already allocated, issued, or installed.",
      {
        code:
          "REPAIR_ORDER_PART_HAS_ACTIVE_INVENTORY",
      },
    );
  }

  await markRepairOrderPartToBeOrderedRecord(
    repairOrderId,
    partLineId,
  );

  return getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );
}

export async function pullRepairOrderPart(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
  membershipId: string | null,
  input: PullRepairOrderPartInput,
) {
  const partLine =
    await getRepairOrderPartLineById(
      organizationId,
      repairOrderId,
      partLineId,
    );

  if (!partLine.partId) {
    throw new AppError(
      400,
      "A catalog part is required before inventory can be pulled.",
      {
        code:
          "REPAIR_ORDER_PART_CATALOG_PART_REQUIRED",
      },
    );
  }

  const allocatedQty =
    Number(
      partLine.allocatedQty.toString(),
    );

  const pulledQty =
    Number(
      partLine.pulledQty.toString(),
    );

  const remainingAllocatedQty =
    allocatedQty -
    pulledQty;

  if (
    input.quantity >
    remainingAllocatedQty
  ) {
    throw new AppError(
      400,
      "Pulled quantity exceeds the remaining allocated quantity.",
      {
        code:
          "REPAIR_ORDER_PART_PULL_EXCEEDS_ALLOCATION",
      },
    );
  }

  await pullRepairOrderPartRecord(
    organizationId,
    repairOrderId,
    partLineId,
    input.quantity,
    membershipId,
    input.notes,
  );

  return getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );
}

//************************************************************** */

export async function stageRepairOrderPart(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
  membershipId: string | null,
  input: StageRepairOrderPartInput,
) {
  const partLine =
    await getRepairOrderPartLineById(
      organizationId,
      repairOrderId,
      partLineId,
    );

  const allocatedQty =
    Number(
      partLine.allocatedQty.toString(),
    );

  const pulledQty =
    Number(
      partLine.pulledQty.toString(),
    );

  if (
    allocatedQty <= 0 ||
    pulledQty <
      allocatedQty
  ) {
    throw new AppError(
      400,
      "All allocated quantity must be pulled before the part can be staged.",
      {
        code:
          "REPAIR_ORDER_PART_STAGE_NOT_READY",
      },
    );
  }

  if (
    partLine.status ===
    "STAGED"
  ) {
    throw new AppError(
      400,
      "Part is already staged.",
      {
        code:
          "REPAIR_ORDER_PART_ALREADY_STAGED",
      },
    );
  }

  await stageRepairOrderPartRecord(
    organizationId,
    repairOrderId,
    partLineId,
    membershipId,
    input.notes,
  );

  return getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );
}

//************************************************************** */

export async function deleteRepairOrderPartLine(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
): Promise<void> {
  const partLine =
    await getRepairOrderPartLineById(
      organizationId,
      repairOrderId,
      partLineId,
    );

  const allocatedQty =
    Number(
      partLine.allocatedQty.toString(),
    );

  const pulledQty =
    Number(
      partLine.pulledQty.toString(),
    );

  const installedQty =
    Number(
      partLine.installedQty.toString(),
    );

  if (
    allocatedQty > 0 ||
    pulledQty > 0 ||
    installedQty > 0
  ) {
    throw new AppError(
      400,
      "Cannot delete a part line with active inventory activity.",
      {
        code:
          "REPAIR_ORDER_PART_LINE_HAS_INVENTORY_ACTIVITY",
      },
    );
  }

  await deleteRepairOrderPartLineRecord(
    repairOrderId,
    partLineId,
  );
}

//************************************************************** */

