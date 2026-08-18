import { AppError } from "../../platform/errors/app-error.js";

import {
  getRepairOrderById,
} from "../repair-orders/repair-order.service.js";

import {
  assignTechnicianRecord,
  findActiveTechnicianAssignment,
  findTechnicianMembership,
} from "./technician-assignment.repository.js";

import type {
  AssignTechnicianInput,
} from "./technician-assignment.schemas.js";

//************************************************************** */

export async function assignTechnician(
  organizationId: string,
  repairOrderId: string,
  assignedByMembershipId: string | null,
  input: AssignTechnicianInput,
) {
  const repairOrder =
    await getRepairOrderById(
      organizationId,
      repairOrderId,
    );

  if (!repairOrder) {
    throw new AppError(
      404,
      "Repair order not found.",
      {
        code:
          "REPAIR_ORDER_NOT_FOUND",
      },
    );
  }

  const technicianMembership =
    await findTechnicianMembership(
      organizationId,
      input.technicianMembershipId,
    );

if (!technicianMembership) {
  throw new AppError(
    400,
    "The selected membership is not an active technician, manager, or owner.",
    {
      code:
        "TECHNICIAN_ASSIGNMENT_INVALID_TECHNICIAN",
    },
  );
}

  const activeAssignment =
    await findActiveTechnicianAssignment(
      organizationId,
      repairOrderId,
    );

  if (activeAssignment) {
    throw new AppError(
      400,
      "This repair order already has an active technician assignment.",
      {
        code:
          "TECHNICIAN_ASSIGNMENT_ALREADY_ACTIVE",
      },
    );
  }

  return assignTechnicianRecord(
    organizationId,
    repairOrderId,
    input.technicianMembershipId,
    assignedByMembershipId,
    input.notes,
  );
}