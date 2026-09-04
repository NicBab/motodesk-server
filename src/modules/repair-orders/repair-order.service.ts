import {
  MembershipRole,
  RepairOrderStatus,
} from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import { findMembershipById } from "../memberships/membership.repository.js";

import {
  createRepairOrderRecord,
  findRepairOrderById,
  findRepairOrdersByOrganization,
  updateRepairOrderRecord,
  updateRepairOrderStatusRecord,
  approveRepairOrderRecord,
} from "./repair-order.repository.js";

import type {
  CreateRepairOrderInput,
  ListRepairOrdersQueryInput,
  UpdateRepairOrderInput,
  UpdateRepairOrderStatusInput,
  BeginRepairOrderQualityCheckInput,
  FailRepairOrderQualityCheckInput,
  PassRepairOrderQualityCheckInput,
  CashierRepairOrderInput,
  CloseRepairOrderInput,
  PickupRepairOrderInput,
  ApproveRepairOrderInput,
  DeclineRepairOrderApprovalInput,
  RequestRepairOrderApprovalInput,
  CompleteRepairOrderPartsReviewInput,
} from "./repair-order.schemas.js";

import { findCustomerById } from "../customers/customer.repository.js";

import { findVehicleById } from "../vehicles/vehicle.repository.js";

import {
  cashierRepairOrderRecord,
  pickupRepairOrderRecord,
} from "./repair-order-cashier-pickup.repository.js";

//************************************************************** */

const READY_PART_STATUSES = new Set([
  "RECEIVED",
  "PULLED",
  "STAGED",
  "ISSUED",
  "INSTALLED",
  "WAIVED",
]);

//************************************************************** */

const REPAIR_ORDER_STATUS_TRANSITIONS: Record<
  RepairOrderStatus,
  readonly RepairOrderStatus[]
> = {
  ESTIMATE: ["AWAITING_CUSTOMER_APPROVAL", "APPROVED", "CANCELLED"],

  AWAITING_CUSTOMER_APPROVAL: ["APPROVED", "CANCELLED"],

  APPROVED: ["PARTS_REVIEW", "READY_TO_WORK", "SCHEDULED", "CANCELLED"],

  PARTS_REVIEW: ["WAITING_ON_PARTS", "READY_TO_WORK", "CANCELLED"],

  WAITING_ON_PARTS: ["READY_TO_WORK", "CANCELLED"],

  READY_TO_WORK: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],

  SCHEDULED: ["READY_TO_WORK", "IN_PROGRESS", "CANCELLED"],

  IN_PROGRESS: [
    "PAUSED",
    "WAITING_ON_ADDITIONAL_APPROVAL",
    "WORK_COMPLETE",
    "CANCELLED",
  ],

  PAUSED: ["IN_PROGRESS", "WAITING_ON_ADDITIONAL_APPROVAL", "CANCELLED"],

  WAITING_ON_ADDITIONAL_APPROVAL: ["IN_PROGRESS", "CANCELLED"],

  WORK_COMPLETE: ["QUALITY_CHECK", "IN_PROGRESS"],

  QUALITY_CHECK: ["READY_FOR_PICKUP", "IN_PROGRESS"],

  READY_FOR_PICKUP: ["CASHIERED"],

  CASHIERED: ["COMPLETED", "PICKED_UP"],

  COMPLETED: ["PICKED_UP", "CLOSED"],

  PICKED_UP: ["CLOSED"],

  CLOSED: [],

  CANCELLED: [],
};

//************************************************************** */

async function assertCustomerAndVehicleValid(
  organizationId: string,
  customerId: string,
  vehicleId: string,
): Promise<void> {
  const customer = await findCustomerById(organizationId, customerId);

  if (!customer) {
    throw new AppError(
      400,
      "The selected customer does not belong to this organization.",
      {
        code: "REPAIR_ORDER_CUSTOMER_INVALID",
      },
    );
  }

  if (!customer.isActive) {
    throw new AppError(400, "The selected customer is archived.", {
      code: "REPAIR_ORDER_CUSTOMER_ARCHIVED",
    });
  }

  const vehicle = await findVehicleById(organizationId, vehicleId);

  if (!vehicle) {
    throw new AppError(
      400,
      "The selected vehicle does not belong to this organization.",
      {
        code: "REPAIR_ORDER_VEHICLE_INVALID",
      },
    );
  }

  if (!vehicle.isActive) {
    throw new AppError(400, "The selected vehicle is archived.", {
      code: "REPAIR_ORDER_VEHICLE_ARCHIVED",
    });
  }

  if (vehicle.customerId !== null && vehicle.customerId !== customerId) {
    throw new AppError(
      400,
      "The selected vehicle is assigned to a different customer.",
      {
        code: "REPAIR_ORDER_CUSTOMER_VEHICLE_MISMATCH",
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
  const membership = await findMembershipById(organizationId, membershipId);

  if (!membership) {
    throw new AppError(
      400,
      "The selected organization membership is invalid.",
      {
        code: errorCode,
      },
    );
  }

  if (!allowedRoles.includes(membership.role)) {
    throw new AppError(
      400,
      "The selected membership does not have an allowed role.",
      {
        code: errorCode,
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

  if (input.serviceAdvisorMembershipId) {
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

  if (input.primaryTechnicianMembershipId) {
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

  return createRepairOrderRecord(organizationId, input, membershipId);
}

//************************************************************** */

export async function getRepairOrderById(
  organizationId: string,
  repairOrderId: string,
) {
  const repairOrder = await findRepairOrderById(organizationId, repairOrderId);

  if (!repairOrder) {
    throw new AppError(404, "Repair order not found.", {
      code: "REPAIR_ORDER_NOT_FOUND",
    });
  }

  return repairOrder;
}

//************************************************************** */

export async function listRepairOrders(
  organizationId: string,
  query: ListRepairOrdersQueryInput,
) {
  return findRepairOrdersByOrganization(organizationId, query);
}

//************************************************************** */

export async function updateRepairOrder(
  organizationId: string,
  repairOrderId: string,
  input: UpdateRepairOrderInput,
) {
  const existingRepairOrder = await findRepairOrderById(
    organizationId,
    repairOrderId,
  );

  if (!existingRepairOrder) {
    throw new AppError(404, "Repair order not found.", {
      code: "REPAIR_ORDER_NOT_FOUND",
    });
  }

  if (input.serviceAdvisorMembershipId) {
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

  if (input.primaryTechnicianMembershipId) {
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

  await updateRepairOrderRecord(organizationId, repairOrderId, input);

  return getRepairOrderById(organizationId, repairOrderId);
}

//************************************************************** */

export async function updateRepairOrderStatus(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: UpdateRepairOrderStatusInput,
) {
  const existingRepairOrder = await findRepairOrderById(
    organizationId,
    repairOrderId,
  );

  if (!existingRepairOrder) {
    throw new AppError(404, "Repair order not found.", {
      code: "REPAIR_ORDER_NOT_FOUND",
    });
  }

  if (existingRepairOrder.status === input.status) {
    throw new AppError(400, "Repair order is already in this status.", {
      code: "REPAIR_ORDER_STATUS_UNCHANGED",
    });
  }

  const allowedTransitions =
    REPAIR_ORDER_STATUS_TRANSITIONS[existingRepairOrder.status];

  if (!allowedTransitions.includes(input.status)) {
    throw new AppError(
      400,
      `Repair order cannot transition from ${existingRepairOrder.status} to ${input.status}.`,
      {
        code: "REPAIR_ORDER_STATUS_TRANSITION_INVALID",
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

  return getRepairOrderById(organizationId, repairOrderId);
}

//************************************************************** */

export async function evaluateRepairOrderReadiness(
  organizationId: string,
  repairOrderId: string,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "WAITING_ON_PARTS") {
    return repairOrder;
  }

  const blockingLines = repairOrder.partLines.filter((line) => line.blocksWork);

  if (blockingLines.length === 0) {
    return repairOrder;
  }

  const allBlockingLinesReady = blockingLines.every((line) =>
    READY_PART_STATUSES.has(line.status),
  );

  if (!allBlockingLinesReady) {
    return repairOrder;
  }

  await updateRepairOrderStatusRecord(
    organizationId,
    repairOrderId,
    repairOrder.status,
    {
      status: "READY_TO_WORK",

      notes: "All blocking repair order parts are available.",

      automatic: true,
    },
    null,
  );

  return getRepairOrderById(organizationId, repairOrderId);
}

//************************************************************** */

export async function beginRepairOrderQualityCheck(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: BeginRepairOrderQualityCheckInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "WORK_COMPLETE") {
    throw new AppError(
      400,
      "Quality check can only begin after work is complete.",
      {
        code: "REPAIR_ORDER_QC_BEGIN_INVALID_STATUS",
      },
    );
  }

  return updateRepairOrderStatus(organizationId, repairOrderId, membershipId, {
    status: "QUALITY_CHECK",

    notes: input.notes ?? "Quality check started.",

    automatic: false,
  });
}

//************************************************************** */

export async function passRepairOrderQualityCheck(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: PassRepairOrderQualityCheckInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "QUALITY_CHECK") {
    throw new AppError(
      400,
      "Quality check can only be passed while the repair order is in quality check.",
      {
        code: "REPAIR_ORDER_QC_PASS_INVALID_STATUS",
      },
    );
  }

  return updateRepairOrderStatus(organizationId, repairOrderId, membershipId, {
    status: "READY_FOR_PICKUP",

    notes: input.notes ?? "Quality check passed.",

    automatic: false,
  });
}

//************************************************************** */

export async function failRepairOrderQualityCheck(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: FailRepairOrderQualityCheckInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "QUALITY_CHECK") {
    throw new AppError(
      400,
      "Quality check can only be failed while the repair order is in quality check.",
      {
        code: "REPAIR_ORDER_QC_FAIL_INVALID_STATUS",
      },
    );
  }

  return updateRepairOrderStatus(organizationId, repairOrderId, membershipId, {
    status: "IN_PROGRESS",

    notes: input.notes,

    automatic: false,
  });
}

//************************************************************** */

// export async function cashierRepairOrder(
//   organizationId: string,
//   repairOrderId: string,
//   membershipId: string | null,
//   input: CashierRepairOrderInput,
// ) {
//   const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

//   if (repairOrder.status !== "READY_FOR_PICKUP") {
//     throw new AppError(
//       400,
//       "Repair order can only be cashiered when it is ready for pickup.",
//       {
//         code: "REPAIR_ORDER_CASHIER_INVALID_STATUS",
//       },
//     );
//   }

//   return updateRepairOrderStatus(organizationId, repairOrderId, membershipId, {
//     status: "CASHIERED",

//     notes: input.notes ?? "Repair order cashiered.",

//     automatic: false,
//   });
// }

export async function cashierRepairOrder(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: CashierRepairOrderInput,
) {
  const repairOrder =
    await getRepairOrderById(
      organizationId,
      repairOrderId,
    );

  if (
    repairOrder.status !==
    "READY_FOR_PICKUP"
  ) {
    throw new AppError(
      400,
      "Repair order can only be cashiered when it is ready for pickup.",
      {
        code:
          "REPAIR_ORDER_CASHIER_INVALID_STATUS",
      },
    );
  }

  const updatedRepairOrder =
    await cashierRepairOrderRecord(
      organizationId,
      repairOrderId,
      membershipId,
      input,
    );

  if (
    !updatedRepairOrder
  ) {
    throw new AppError(
      400,
      "Repair order can only be cashiered when it is ready for pickup.",
      {
        code:
          "REPAIR_ORDER_CASHIER_INVALID_STATUS",
      },
    );
  }

  return updatedRepairOrder;
}

//************************************************************** */

// export async function pickupRepairOrder(
//   organizationId: string,
//   repairOrderId: string,
//   membershipId: string | null,
//   input: PickupRepairOrderInput,
// ) {
//   const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

//   if (repairOrder.status !== "CASHIERED") {
//     throw new AppError(
//       400,
//       "Repair order can only be picked up after it has been cashiered.",
//       {
//         code: "REPAIR_ORDER_PICKUP_INVALID_STATUS",
//       },
//     );
//   }

//   return updateRepairOrderStatus(organizationId, repairOrderId, membershipId, {
//     status: "PICKED_UP",

//     notes: input.notes ?? "Unit picked up by customer.",

//     automatic: false,
//   });
// }

export async function pickupRepairOrder(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: PickupRepairOrderInput,
) {
  const repairOrder =
    await getRepairOrderById(
      organizationId,
      repairOrderId,
    );

  if (
    repairOrder.status !==
    "CASHIERED"
  ) {
    throw new AppError(
      400,
      "Repair order can only be picked up after it has been cashiered.",
      {
        code:
          "REPAIR_ORDER_PICKUP_INVALID_STATUS",
      },
    );
  }

  const updatedRepairOrder =
    await pickupRepairOrderRecord(
      organizationId,
      repairOrderId,
      membershipId,
      input,
    );

  if (
    !updatedRepairOrder
  ) {
    throw new AppError(
      400,
      "Repair order can only be picked up after it has been cashiered.",
      {
        code:
          "REPAIR_ORDER_PICKUP_INVALID_STATUS",
      },
    );
  }

  return updatedRepairOrder;
}

//************************************************************** */

export async function closeRepairOrder(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: CloseRepairOrderInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "PICKED_UP") {
    throw new AppError(
      400,
      "Repair order can only be closed after the unit has been picked up.",
      {
        code: "REPAIR_ORDER_CLOSE_INVALID_STATUS",
      },
    );
  }

  return updateRepairOrderStatus(organizationId, repairOrderId, membershipId, {
    status: "CLOSED",

    notes: input.notes ?? "Repair order closed.",

    automatic: false,
  });
}

//************************************************************** */

export async function requestRepairOrderApproval(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: RequestRepairOrderApprovalInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "ESTIMATE") {
    throw new AppError(
      400,
      "Customer approval can only be requested from an estimate.",
      {
        code: "REPAIR_ORDER_APPROVAL_REQUEST_INVALID_STATUS",
      },
    );
  }

  return updateRepairOrderStatus(organizationId, repairOrderId, membershipId, {
    status: "AWAITING_CUSTOMER_APPROVAL",

    notes: input.notes ?? "Customer approval requested.",

    automatic: false,
  });
}

//************************************************************** */

export async function approveRepairOrder(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: ApproveRepairOrderInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "AWAITING_CUSTOMER_APPROVAL") {
    throw new AppError(
      400,
      "Repair order can only be approved while awaiting customer approval.",
      {
        code: "REPAIR_ORDER_APPROVAL_INVALID_STATUS",
      },
    );
  }

  const approvedRepairOrder = await approveRepairOrderRecord(
    organizationId,
    repairOrderId,
    repairOrder.status,
    input.approvalMethod,
    input.approvedBy,
    input.approvedAmount,
    input.notes,
    membershipId,
  );

  if (!approvedRepairOrder) {
    throw new AppError(400, "Repair order approval could not be completed.", {
      code: "REPAIR_ORDER_APPROVAL_FAILED",
    });
  }

  return approvedRepairOrder;
}

//************************************************************** */

export async function declineRepairOrderApproval(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: DeclineRepairOrderApprovalInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "AWAITING_CUSTOMER_APPROVAL") {
    throw new AppError(
      400,
      "Repair order can only be declined while awaiting customer approval.",
      {
        code: "REPAIR_ORDER_APPROVAL_DECLINE_INVALID_STATUS",
      },
    );
  }

  await updateRepairOrderRecord(organizationId, repairOrderId, {
    approvalNotes: input.notes,
  });

  return updateRepairOrderStatus(organizationId, repairOrderId, membershipId, {
    status: "CANCELLED",

    notes: input.notes,

    automatic: false,
  });
}

//************************************************************** */

export async function completeRepairOrderPartsReview(
  organizationId: string,
  repairOrderId: string,
  membershipId: string | null,
  input: CompleteRepairOrderPartsReviewInput,
) {
  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  if (repairOrder.status !== "PARTS_REVIEW") {
    throw new AppError(
      400,
      "Parts review can only be completed while the repair order is in PARTS_REVIEW.",
      {
        code: "REPAIR_ORDER_PARTS_REVIEW_INVALID_STATUS",
      },
    );
  }

  const blockingLines = repairOrder.partLines.filter((line) => line.blocksWork);

  const unresolvedLines = blockingLines.filter(
    (line) => line.status === "NEEDS_REVIEW",
  );

  if (unresolvedLines.length > 0) {
    throw new AppError(
      400,
      "Every blocking part must be resolved before completing parts review.",
      {
        code: "REPAIR_ORDER_PARTS_REVIEW_INCOMPLETE",
      },
    );
  }

  const readyStatuses = new Set([
    "PULLED",
    "STAGED",
    "ISSUED",
    "INSTALLED",
    "WAIVED",
  ]);

  const allBlockingPartsReady = blockingLines.every((line) =>
    readyStatuses.has(line.status),
  );

  const nextStatus = allBlockingPartsReady
    ? "READY_TO_WORK"
    : "WAITING_ON_PARTS";

  return updateRepairOrderStatus(organizationId, repairOrderId, membershipId, {
    status: nextStatus,

    notes:
      input.notes ??
      (allBlockingPartsReady
        ? "Parts review completed. All blocking parts are available."
        : "Parts review completed. Repair order is waiting on outstanding parts."),

    automatic: false,
  });
}
