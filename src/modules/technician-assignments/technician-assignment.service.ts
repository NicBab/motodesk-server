import { AppError } from "../../platform/errors/app-error.js";

import { getRepairOrderById } from "../repair-orders/repair-order.service.js";

import {
  assignTechnicianRecord,
  findActiveTechnicianAssignment,
  findTechnicianMembership,
  reassignTechnicianRecord,
  removeTechnicianAssignmentRecord,
} from "./technician-assignment.repository.js";

import type {
  AssignTechnicianInput,
  ReassignTechnicianInput,
  RemoveTechnicianAssignmentInput,
} from "./technician-assignment.schemas.js";

//************************************************************** */

export async function assignTechnician(
  organizationId: string,
  repairOrderId: string,
  assignedByMembershipId: string | null,
  input: AssignTechnicianInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (!repairOrder) {
    throw new AppError(404, "Repair order not found.", {
      code: "REPAIR_ORDER_NOT_FOUND",
    });
  }

  const technicianMembership = await findTechnicianMembership(
    organizationId,
    input.technicianMembershipId,
  );

  if (!technicianMembership) {
    throw new AppError(
      400,
      "The selected membership is not an active technician, manager, or owner.",
      {
        code: "TECHNICIAN_ASSIGNMENT_INVALID_TECHNICIAN",
      },
    );
  }

  const activeAssignment = await findActiveTechnicianAssignment(
    organizationId,
    repairOrderId,
  );

  if (activeAssignment) {
    throw new AppError(
      400,
      "This repair order already has an active technician assignment.",
      {
        code: "TECHNICIAN_ASSIGNMENT_ALREADY_ACTIVE",
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

//************************************************************** */
// Reassign Technician

export async function reassignTechnician(
  organizationId: string,
  repairOrderId: string,
  assignedByMembershipId: string | null,
  input: ReassignTechnicianInput,
) {
  // Verify Repair Order
  await getRepairOrderById(organizationId, repairOrderId);

  // Require Existing Active Assignment
  const currentAssignment = await findActiveTechnicianAssignment(
    organizationId,
    repairOrderId,
  );

  if (!currentAssignment) {
    throw new AppError(
      400,
      "Repair order does not have an active technician assignment.",
      {
        code: "TECHNICIAN_REASSIGNMENT_NO_ACTIVE_ASSIGNMENT",
      },
    );
  }

  // Prevent Same-Technician Reassignment
  if (
    currentAssignment.technicianMembershipId === input.technicianMembershipId
  ) {
    throw new AppError(
      400,
      "Repair order is already assigned to this technician.",
      {
        code: "TECHNICIAN_REASSIGNMENT_SAME_TECHNICIAN",
      },
    );
  }

  // Validate New Technician
  const technicianMembership = await findTechnicianMembership(
    organizationId,
    input.technicianMembershipId,
  );

  if (!technicianMembership) {
    throw new AppError(
      400,
      "The selected membership is not an active technician, manager, or owner.",
      {
        code: "TECHNICIAN_ASSIGNMENT_INVALID_TECHNICIAN",
      },
    );
  }

  // Apply Reassignment

  return reassignTechnicianRecord(
    organizationId,
    repairOrderId,
    currentAssignment.id,
    input.technicianMembershipId,
    assignedByMembershipId,
    input.notes,
  );
}

//************************************************************** */
// Remove Technician Assignment

export async function removeTechnicianAssignment(
  organizationId: string,
  repairOrderId: string,
  input: RemoveTechnicianAssignmentInput,
) {
  await getRepairOrderById(organizationId, repairOrderId);

  const activeAssignment = await findActiveTechnicianAssignment(
    organizationId,
    repairOrderId,
  );

  if (!activeAssignment) {
    throw new AppError(
      400,
      "Repair order does not have an active technician assignment.",
      {
        code: "TECHNICIAN_ASSIGNMENT_REMOVE_NO_ACTIVE_ASSIGNMENT",
      },
    );
  }

  return removeTechnicianAssignmentRecord(
    organizationId,
    repairOrderId,
    activeAssignment.id,
    input.notes,
  );
}

//************************************************************** */
