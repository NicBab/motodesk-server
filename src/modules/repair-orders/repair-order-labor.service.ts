import { MembershipRole } from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import { findMembershipById } from "../memberships/membership.repository.js";

import { getRepairOrderById } from "./repair-order.service.js";

import {
  createRepairOrderLaborLineRecord,
  deleteRepairOrderLaborLineRecord,
  findRepairOrderLaborLineById,
  findRepairOrderLaborLines,
  updateRepairOrderLaborLineRecord,
  startRepairOrderLaborLineRecord,
  completeRepairOrderLaborLineRecord,
} from "./repair-order-labor.repository.js";

import type {
  CreateRepairOrderLaborLineInput,
  UpdateRepairOrderLaborLineInput,
  StartRepairOrderLaborLineInput,
  CompleteRepairOrderLaborLineInput,
} from "./repair-order-labor.schemas.js";

//************************************************************** */

async function assertTechnicianValid(
  organizationId: string,
  technicianMembershipId: string,
): Promise<void> {
  const membership = await findMembershipById(
    organizationId,
    technicianMembershipId,
  );

  if (!membership) {
    throw new AppError(400, "The selected technician membership is invalid.", {
      code: "REPAIR_ORDER_LABOR_TECHNICIAN_INVALID",
    });
  }

  const allowedRoles: MembershipRole[] = [
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MANAGER,
    MembershipRole.TECHNICIAN,
  ];

  if (!allowedRoles.includes(membership.role)) {
    throw new AppError(
      400,
      "The selected membership cannot be assigned as a technician.",
      {
        code: "REPAIR_ORDER_LABOR_TECHNICIAN_ROLE_INVALID",
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
  await getRepairOrderById(organizationId, repairOrderId);

  if (input.technicianMembershipId) {
    await assertTechnicianValid(organizationId, input.technicianMembershipId);
  }

  return createRepairOrderLaborLineRecord(repairOrderId, input);
}

//************************************************************** */

export async function listRepairOrderLaborLines(
  organizationId: string,
  repairOrderId: string,
) {
  await getRepairOrderById(organizationId, repairOrderId);

  return findRepairOrderLaborLines(repairOrderId);
}

//************************************************************** */

export async function getRepairOrderLaborLineById(
  organizationId: string,
  repairOrderId: string,
  laborLineId: string,
) {
  await getRepairOrderById(organizationId, repairOrderId);

  const laborLine = await findRepairOrderLaborLineById(
    repairOrderId,
    laborLineId,
  );

  if (!laborLine) {
    throw new AppError(404, "Repair order labor line not found.", {
      code: "REPAIR_ORDER_LABOR_LINE_NOT_FOUND",
    });
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
  await getRepairOrderLaborLineById(organizationId, repairOrderId, laborLineId);

  if (input.technicianMembershipId) {
    await assertTechnicianValid(organizationId, input.technicianMembershipId);
  }

  await updateRepairOrderLaborLineRecord(repairOrderId, laborLineId, input);

  return getRepairOrderLaborLineById(
    organizationId,
    repairOrderId,
    laborLineId,
  );
}

//************************************************************** */

export async function startRepairOrderLaborLine(
  organizationId: string,
  repairOrderId: string,
  laborLineId: string,
  membershipId: string | null,
  input: StartRepairOrderLaborLineInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  const laborLine = await getRepairOrderLaborLineById(
    organizationId,
    repairOrderId,
    laborLineId,
  );

  if (laborLine.completed) {
    throw new AppError(400, "Completed labor cannot be started.", {
      code: "REPAIR_ORDER_LABOR_ALREADY_COMPLETED",
    });
  }

  if (laborLine.startedAt) {
    throw new AppError(400, "Labor has already been started.", {
      code: "REPAIR_ORDER_LABOR_ALREADY_STARTED",
    });
  }

  if (
    repairOrder.status !== "READY_TO_WORK" &&
    repairOrder.status !== "SCHEDULED" &&
    repairOrder.status !== "IN_PROGRESS"
  ) {
    throw new AppError(
      400,
      "Labor cannot be started while the repair order is in its current status.",
      {
        code: "REPAIR_ORDER_LABOR_START_INVALID_STATUS",
      },
    );
  }

  await startRepairOrderLaborLineRecord(
    organizationId,
    repairOrderId,
    laborLineId,
    repairOrder.status,
    membershipId,
    input.notes,
  );

  return getRepairOrderLaborLineById(
    organizationId,
    repairOrderId,
    laborLineId,
  );
}

//************************************************************** */

export async function completeRepairOrderLaborLine(
  organizationId: string,
  repairOrderId: string,
  laborLineId: string,
  membershipId: string | null,
  input: CompleteRepairOrderLaborLineInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  const laborLine = await getRepairOrderLaborLineById(
    organizationId,
    repairOrderId,
    laborLineId,
  );

  if (laborLine.completed) {
    throw new AppError(400, "Labor has already been completed.", {
      code: "REPAIR_ORDER_LABOR_ALREADY_COMPLETED",
    });
  }

  if (repairOrder.status !== "IN_PROGRESS") {
    throw new AppError(
      400,
      "Labor cannot be completed while the repair order is in its current status.",
      {
        code: "REPAIR_ORDER_LABOR_COMPLETE_INVALID_STATUS",
      },
    );
  }

  await completeRepairOrderLaborLineRecord(
    organizationId,
    repairOrderId,
    laborLineId,
    repairOrder.status,
    membershipId,
    input.notes,
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
  await getRepairOrderLaborLineById(organizationId, repairOrderId, laborLineId);

  await deleteRepairOrderLaborLineRecord(repairOrderId, laborLineId);
}
