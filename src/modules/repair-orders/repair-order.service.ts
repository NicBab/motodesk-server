import {
  MembershipRole,
  RepairOrderStatus,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  createRepairOrderRecord,
  findRepairOrderById,
  findRepairOrdersByOrganization,
  updateRepairOrderRecord,
  updateRepairOrderStatusRecord,
} from "./repair-order.repository.js";

import type {
  CreateRepairOrderInput,
  ListRepairOrdersQueryInput,
  UpdateRepairOrderInput,
  UpdateRepairOrderStatusInput,
} from "./repair-order.schemas.js";

import {
  findCustomerById,
} from "../customers/customer.repository.js";

import {
  findVehicleById,
} from "../vehicles/vehicle.repository.js";

import {
  findMembershipById,
} from "../memberships/membership.repository.js";

//************************************************************** */

async function assertCustomerAndVehicleValid(
  organizationId: string,
  customerId: string,
  vehicleId: string,
): Promise<void> {
  const customer =
    await findCustomerById(
      organizationId,
      customerId,
    );

  if (!customer) {
    throw new AppError(
      400,
      "The selected customer does not belong to this organization.",
      {
        code:
          "REPAIR_ORDER_CUSTOMER_INVALID",
      },
    );
  }

  if (!customer.isActive) {
    throw new AppError(
      400,
      "The selected customer is archived.",
      {
        code:
          "REPAIR_ORDER_CUSTOMER_ARCHIVED",
      },
    );
  }

  const vehicle =
    await findVehicleById(
      organizationId,
      vehicleId,
    );

  if (!vehicle) {
    throw new AppError(
      400,
      "The selected vehicle does not belong to this organization.",
      {
        code:
          "REPAIR_ORDER_VEHICLE_INVALID",
      },
    );
  }

  if (!vehicle.isActive) {
    throw new AppError(
      400,
      "The selected vehicle is archived.",
      {
        code:
          "REPAIR_ORDER_VEHICLE_ARCHIVED",
      },
    );
  }

  if (
    vehicle.customerId !== null &&
    vehicle.customerId !== customerId
  ) {
    throw new AppError(
      400,
      "The selected vehicle is assigned to a different customer.",
      {
        code:
          "REPAIR_ORDER_CUSTOMER_VEHICLE_MISMATCH",
      },
    );
  }
}

//************************************************************** */

async function assertMembershipValid(
  organizationId: string,
  membershipId: string,
  allowedRoles: MembershipRole[],
  errorCode: string,
): Promise<void> {
  const membership =
    await findMembershipById(
      organizationId,
      membershipId,
    );

  if (!membership) {
    throw new AppError(
      400,
      "The selected organization membership is invalid.",
      {
        code:
          errorCode,
      },
    );
  }

  if (
    !allowedRoles.includes(
      membership.role,
    )
  ) {
    throw new AppError(
      400,
      "The selected membership does not have an allowed role.",
      {
        code:
          errorCode,
      },
    );
  }
}

//************************************************************** */

export async function createRepairOrder(
  organizationId: string,
  membershipId: string | null,
  input: CreateRepairOrderInput,
) {
  await assertCustomerAndVehicleValid(
    organizationId,
    input.customerId,
    input.vehicleId,
  );

  if (
    input.serviceAdvisorMembershipId
  ) {
    await assertMembershipValid(
      organizationId,
      input.serviceAdvisorMembershipId,
      [
        MembershipRole.OWNER,
        MembershipRole.ADMIN,
        MembershipRole.MANAGER,
        MembershipRole.SERVICE_ADVISOR,
      ],
      "REPAIR_ORDER_SERVICE_ADVISOR_INVALID",
    );
  }

  if (
    input.primaryTechnicianMembershipId
  ) {
    await assertMembershipValid(
      organizationId,
      input.primaryTechnicianMembershipId,
      [
        MembershipRole.OWNER,
        MembershipRole.ADMIN,
        MembershipRole.MANAGER,
        MembershipRole.TECHNICIAN,
      ],
      "REPAIR_ORDER_TECHNICIAN_INVALID",
    );
  }

  return createRepairOrderRecord(
    organizationId,
    input,
    membershipId,
  );
}

//************************************************************** */

export async function getRepairOrderById(
  organizationId: string,
  repairOrderId: string,
) {
  const repairOrder =
    await findRepairOrderById(
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

  return repairOrder;
}

//************************************************************** */

export async function listRepairOrders(
  organizationId: string,
  query: ListRepairOrdersQueryInput,
) {
  return findRepairOrdersByOrganization(
    organizationId,
    query,
  );
}

//************************************************************** */

export async function updateRepairOrder(
  organizationId: string,
  repairOrderId: string,
  input: UpdateRepairOrderInput,
) {
  const existingRepairOrder =
    await findRepairOrderById(
      organizationId,
      repairOrderId,
    );

  if (!existingRepairOrder) {
    throw new AppError(
      404,
      "Repair order not found.",
      {
        code:
          "REPAIR_ORDER_NOT_FOUND",
      },
    );
  }

  if (
    input.serviceAdvisorMembershipId
  ) {
    await assertMembershipValid(
      organizationId,
      input.serviceAdvisorMembershipId,
      [
        MembershipRole.OWNER,
        MembershipRole.ADMIN,
        MembershipRole.MANAGER,
        MembershipRole.SERVICE_ADVISOR,
      ],
      "REPAIR_ORDER_SERVICE_ADVISOR_INVALID",
    );
  }

  if (
    input.primaryTechnicianMembershipId
  ) {
    await assertMembershipValid(
      organizationId,
      input.primaryTechnicianMembershipId,
      [
        MembershipRole.OWNER,
        MembershipRole.ADMIN,
        MembershipRole.MANAGER,
        MembershipRole.TECHNICIAN,
      ],
      "REPAIR_ORDER_TECHNICIAN_INVALID",
    );
  }

  await updateRepairOrderRecord(
    organizationId,
    repairOrderId,
    input,
  );

  return getRepairOrderById(
    organizationId,
    repairOrderId,
  );
}

//************************************************************** */

export async function updateRepairOrderStatus(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: UpdateRepairOrderStatusInput,
) {
  const existingRepairOrder =
    await findRepairOrderById(
      organizationId,
      repairOrderId,
    );

  if (!existingRepairOrder) {
    throw new AppError(
      404,
      "Repair order not found.",
      {
        code:
          "REPAIR_ORDER_NOT_FOUND",
      },
    );
  }

  if (
    existingRepairOrder.status ===
    input.status
  ) {
    throw new AppError(
      400,
      "Repair order is already in this status.",
      {
        code:
          "REPAIR_ORDER_STATUS_UNCHANGED",
      },
    );
  }

  await updateRepairOrderStatusRecord(
    organizationId,
    repairOrderId,
    existingRepairOrder.status,
    input,
    membershipId,
  );

  return getRepairOrderById(
    organizationId,
    repairOrderId,
  );
}