
import { AppError } from "../../platform/errors/app-error.js";

import {
  assignRepairOrderToServiceBayRecord,
  createServiceBayRecord,
  findActiveServiceBayAssignmentForBay,
  findActiveServiceBayAssignmentForRepairOrder,
  findRepairOrderForServiceBay,
  findServiceBayById,
  findServiceBayByName,
  listServiceBayRecords,
  releaseRepairOrderFromServiceBayRecord,
  updateServiceBayStatusRecord,
} from "./service-bay.repository.js";

import type {
  AssignRepairOrderToServiceBayInput,
  CreateServiceBayInput,
  ReleaseRepairOrderFromServiceBayInput,
  UpdateServiceBayStatusInput,
} from "./service-bay.schemas.js";

//************************************************************** */
// Require Repair Order Location

async function requireRepairOrderLocation(
  organizationId: string,
  shopLocationId: string,
  repairOrderId: string,
) {
  const repairOrder = await findRepairOrderForServiceBay(
    organizationId,
    shopLocationId,
    repairOrderId,
  );

  if (!repairOrder) {
    throw new AppError(404, "Repair order not found.", {
      code: "REPAIR_ORDER_NOT_FOUND",
    });
  }

  return repairOrder;
}

//************************************************************** */
// Create Service Bay

export async function createServiceBay(
  organizationId: string,
  shopLocationId: string,
  input: CreateServiceBayInput,
) {
  const existingBay = await findServiceBayByName(
    organizationId,
    input.name,
  );

  if (existingBay) {
    throw new AppError(400, "A service bay with this name already exists.", {
      code: "SERVICE_BAY_NAME_ALREADY_EXISTS",
    });
  }

  return createServiceBayRecord(
    organizationId,
    shopLocationId,
    input.name,
    input.description,
  );
}

//************************************************************** */
// List Service Bays

export async function listServiceBays(
  organizationId: string,
  shopLocationId: string,
) {
  return listServiceBayRecords(
    organizationId,
    shopLocationId,
  );
}

//************************************************************** */
// Assign Repair Order To Service Bay

export async function assignRepairOrderToServiceBay(
  organizationId: string,
  shopLocationId: string,
  repairOrderId: string,
  assignedByMembershipId: string | null,
  input: AssignRepairOrderToServiceBayInput,
) {
  //************************************************************** */
  // Verify Repair Order

  await requireRepairOrderLocation(
    organizationId,
    shopLocationId,
    repairOrderId,
  );

  //************************************************************** */
  // Verify Service Bay

  const serviceBay = await findServiceBayById(
    organizationId,
    shopLocationId,
    input.serviceBayId,
  );

  if (!serviceBay) {
    throw new AppError(404, "Service bay not found.", {
      code: "SERVICE_BAY_NOT_FOUND",
    });
  }

  if (serviceBay.status !== "ACTIVE") {
    throw new AppError(
      400,
      "Repair orders can only be assigned to active service bays.",
      {
        code: "SERVICE_BAY_NOT_ACTIVE",
      },
    );
  }

  //************************************************************** */
  // Prevent RO From Occupying Multiple Bays

  const existingRepairOrderAssignment =
    await findActiveServiceBayAssignmentForRepairOrder(
      organizationId,
      shopLocationId,
      repairOrderId,
    );

  if (existingRepairOrderAssignment) {
    throw new AppError(
      400,
      "Repair order is already assigned to a service bay.",
      {
        code: "REPAIR_ORDER_SERVICE_BAY_ALREADY_ASSIGNED",
      },
    );
  }

  //************************************************************** */
  // Prevent Multiple ROs From Occupying Same Bay

  const existingBayAssignment =
    await findActiveServiceBayAssignmentForBay(
      organizationId,
      shopLocationId,
      input.serviceBayId,
    );

  if (existingBayAssignment) {
    throw new AppError(
      400,
      "Service bay is currently occupied by another repair order.",
      {
        code: "SERVICE_BAY_ALREADY_OCCUPIED",
      },
    );
  }

  //************************************************************** */
  // Create Assignment

  const assignment =
    await assignRepairOrderToServiceBayRecord(
      organizationId,
      shopLocationId,
      repairOrderId,
      input.serviceBayId,
      assignedByMembershipId,
      input.notes,
    );

  if (!assignment) {
    throw new AppError(
      409,
      "The repair order or service bay is no longer available for assignment.",
      {
        code: "SERVICE_BAY_ASSIGNMENT_FAILED",
      },
    );
  }

  return assignment;
}

//************************************************************** */
// Release Repair Order From Service Bay

export async function releaseRepairOrderFromServiceBay(
  organizationId: string,
  shopLocationId: string,
  repairOrderId: string,
  input: ReleaseRepairOrderFromServiceBayInput,
) {
  //************************************************************** */
  // Verify Repair Order

  await requireRepairOrderLocation(
    organizationId,
    shopLocationId,
    repairOrderId,
  );

  //************************************************************** */
  // Require Active Bay Assignment

  const activeAssignment =
    await findActiveServiceBayAssignmentForRepairOrder(
      organizationId,
      shopLocationId,
      repairOrderId,
    );

  if (!activeAssignment) {
    throw new AppError(
      400,
      "Repair order does not have an active service bay assignment.",
      {
        code: "SERVICE_BAY_RELEASE_NO_ACTIVE_ASSIGNMENT",
      },
    );
  }

  //************************************************************** */
  // Release Assignment

  const releasedAssignment =
    await releaseRepairOrderFromServiceBayRecord(
      organizationId,
      shopLocationId,
      repairOrderId,
      activeAssignment.id,
      input.notes,
    );

  if (!releasedAssignment) {
    throw new AppError(
      400,
      "Service bay assignment could not be released.",
      {
        code: "SERVICE_BAY_RELEASE_FAILED",
      },
    );
  }

  return releasedAssignment;
}

//************************************************************** */
// Update Service Bay Status

export async function updateServiceBayStatus(
  organizationId: string,
  shopLocationId: string,
  serviceBayId: string,
  input: UpdateServiceBayStatusInput,
) {
  const serviceBay = await findServiceBayById(
    organizationId,
    shopLocationId,
    serviceBayId,
  );

  if (!serviceBay) {
    throw new AppError(404, "Service bay not found.", {
      code: "SERVICE_BAY_NOT_FOUND",
    });
  }

  if (serviceBay.status === input.status) {
    throw new AppError(
      400,
      "Service bay is already in this status.",
      {
        code: "SERVICE_BAY_STATUS_UNCHANGED",
      },
    );
  }

  const activeAssignment =
    await findActiveServiceBayAssignmentForBay(
      organizationId,
      shopLocationId,
      serviceBayId,
    );

  if (
    activeAssignment &&
    (input.status === "MAINTENANCE" ||
      input.status === "INACTIVE")
  ) {
    throw new AppError(
      400,
      "An occupied service bay cannot be placed into maintenance or made inactive.",
      {
        code: "SERVICE_BAY_STATUS_OCCUPIED",
      },
    );
  }

  const updatedServiceBay =
    await updateServiceBayStatusRecord(
      organizationId,
      shopLocationId,
      serviceBayId,
      input.status,
    );

  if (!updatedServiceBay) {
    throw new AppError(
      400,
      "Service bay status could not be updated.",
      {
        code: "SERVICE_BAY_STATUS_UPDATE_FAILED",
      },
    );
  }

  return updatedServiceBay;
}

//************************************************************** */
