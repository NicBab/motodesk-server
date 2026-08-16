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
  createRepairOrderPartLineRecord,
  deleteRepairOrderPartLineRecord,
  findRepairOrderPartLineById,
  findRepairOrderPartLines,
  updateRepairOrderPartLineRecord,
} from "./repair-order-part.repository.js";

import type {
  CreateRepairOrderPartLineInput,
  UpdateRepairOrderPartLineInput,
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

  if (input.partId) {
    await assertPartValid(
      organizationId,
      input.partId,
    );
  }

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

export async function deleteRepairOrderPartLine(
  organizationId: string,
  repairOrderId: string,
  partLineId: string,
): Promise<void> {
  await getRepairOrderPartLineById(
    organizationId,
    repairOrderId,
    partLineId,
  );

  await deleteRepairOrderPartLineRecord(
    repairOrderId,
    partLineId,
  );
}