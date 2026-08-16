import {
  MembershipRole,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  findMembershipById,
} from "../memberships/membership.repository.js";

import {
  getRepairOrderById,
} from "./repair-order.service.js";

import {
  createRepairOrderLaborLineRecord,
  deleteRepairOrderLaborLineRecord,
  findRepairOrderLaborLineById,
  findRepairOrderLaborLines,
  updateRepairOrderLaborLineRecord,
} from "./repair-order-labor.repository.js";

import type {
  CreateRepairOrderLaborLineInput,
  UpdateRepairOrderLaborLineInput,
} from "./repair-order-labor.schemas.js";

//************************************************************** */

async function assertTechnicianValid(
  organizationId: string,
  technicianMembershipId: string,
): Promise<void> {
  const membership =
    await findMembershipById(
      organizationId,
      technicianMembershipId,
    );

  if (!membership) {
    throw new AppError(
      400,
      "The selected technician membership is invalid.",
      {
        code:
          "REPAIR_ORDER_LABOR_TECHNICIAN_INVALID",
      },
    );
  }

const allowedRoles: MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.TECHNICIAN,
];

  if (
    !allowedRoles.includes(
      membership.role,
    )
  ) {
    throw new AppError(
      400,
      "The selected membership cannot be assigned as a technician.",
      {
        code:
          "REPAIR_ORDER_LABOR_TECHNICIAN_ROLE_INVALID",
      },
    );
  }
}

//************************************************************** */

export async function createRepairOrderLaborLine(
  organizationId: string,
  repairOrderId: string,
  input: CreateRepairOrderLaborLineInput,
) {
  await getRepairOrderById(
    organizationId,
    repairOrderId,
  );

  if (
    input.technicianMembershipId
  ) {
    await assertTechnicianValid(
      organizationId,
      input.technicianMembershipId,
    );
  }

  return createRepairOrderLaborLineRecord(
    repairOrderId,
    input,
  );
}

//************************************************************** */

export async function listRepairOrderLaborLines(
  organizationId: string,
  repairOrderId: string,
) {
  await getRepairOrderById(
    organizationId,
    repairOrderId,
  );

  return findRepairOrderLaborLines(
    repairOrderId,
  );
}

//************************************************************** */

export async function getRepairOrderLaborLineById(
  organizationId: string,
  repairOrderId: string,
  laborLineId: string,
) {
  await getRepairOrderById(
    organizationId,
    repairOrderId,
  );

  const laborLine =
    await findRepairOrderLaborLineById(
      repairOrderId,
      laborLineId,
    );

  if (!laborLine) {
    throw new AppError(
      404,
      "Repair order labor line not found.",
      {
        code:
          "REPAIR_ORDER_LABOR_LINE_NOT_FOUND",
      },
    );
  }

  return laborLine;
}

//************************************************************** */

export async function updateRepairOrderLaborLine(
  organizationId: string,
  repairOrderId: string,
  laborLineId: string,
  input: UpdateRepairOrderLaborLineInput,
) {
  await getRepairOrderLaborLineById(
    organizationId,
    repairOrderId,
    laborLineId,
  );

  if (
    input.technicianMembershipId
  ) {
    await assertTechnicianValid(
      organizationId,
      input.technicianMembershipId,
    );
  }

  await updateRepairOrderLaborLineRecord(
    repairOrderId,
    laborLineId,
    input,
  );

  return getRepairOrderLaborLineById(
    organizationId,
    repairOrderId,
    laborLineId,
  );
}

//************************************************************** */

export async function deleteRepairOrderLaborLine(
  organizationId: string,
  repairOrderId: string,
  laborLineId: string,
): Promise<void> {
  await getRepairOrderLaborLineById(
    organizationId,
    repairOrderId,
    laborLineId,
  );

  await deleteRepairOrderLaborLineRecord(
    repairOrderId,
    laborLineId,
  );
}