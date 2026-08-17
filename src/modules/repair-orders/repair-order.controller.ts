import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import { created, ok } from "../../platform/http/api-response.js";

import {
  createRepairOrder,
  getRepairOrderById,
  listRepairOrders,
  updateRepairOrder,
  updateRepairOrderStatus,
  beginRepairOrderQualityCheck,
  failRepairOrderQualityCheck,
  passRepairOrderQualityCheck,
  cashierRepairOrder,
  closeRepairOrder,
  pickupRepairOrder,
  approveRepairOrder,
  declineRepairOrderApproval,
  requestRepairOrderApproval,
  completeRepairOrderPartsReview,
} from "./repair-order.service.js";

import type {
  CreateRepairOrderInput,
  ListRepairOrdersQueryInput,
  RepairOrderIdInput,
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

//************************************************************** */

function requireOrganizationId(request: AuthenticatedRequest): string {
  const organizationId = request.params.organizationId;

  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new AppError(400, "A valid organization ID is required.", {
      code: "ORGANIZATION_ID_REQUIRED",
    });
  }

  return organizationId;
}

//************************************************************** */

function getMembershipId(): string | null {
  const context = getRequestContext();

  return context.membership?.id ?? null;
}

//************************************************************** */

export async function createRepairOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const membershipId = getMembershipId();

  const input = requireValidatedBody<CreateRepairOrderInput>(request);

  const repairOrder = await createRepairOrder(
    organizationId,
    membershipId,
    input,
  );

  created(response, repairOrder);
}

//************************************************************** */

export async function listRepairOrdersHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const query = requireValidatedQuery<ListRepairOrdersQueryInput>(request);

  const repairOrders = await listRepairOrders(organizationId, query);

  ok(response, repairOrders);
}

//************************************************************** */

export async function getRepairOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const repairOrder = await getRepairOrderById(organizationId, repairOrderId);

  ok(response, repairOrder);
}

//************************************************************** */

export async function updateRepairOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<UpdateRepairOrderInput>(request);

  const repairOrder = await updateRepairOrder(
    organizationId,
    repairOrderId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */

export async function updateRepairOrderStatusHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const membershipId = getMembershipId();

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<UpdateRepairOrderStatusInput>(request);

  const repairOrder = await updateRepairOrderStatus(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */

export async function beginRepairOrderQualityCheckHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input =
    requireValidatedBody<BeginRepairOrderQualityCheckInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await beginRepairOrderQualityCheck(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */

export async function passRepairOrderQualityCheckHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<PassRepairOrderQualityCheckInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await passRepairOrderQualityCheck(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */

export async function failRepairOrderQualityCheckHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<FailRepairOrderQualityCheckInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await failRepairOrderQualityCheck(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */

export async function cashierRepairOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<CashierRepairOrderInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await cashierRepairOrder(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */

export async function pickupRepairOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<PickupRepairOrderInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await pickupRepairOrder(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */

export async function closeRepairOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<CloseRepairOrderInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await closeRepairOrder(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */

export async function requestRepairOrderApprovalHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<RequestRepairOrderApprovalInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await requestRepairOrderApproval(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */

export async function approveRepairOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<ApproveRepairOrderInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await approveRepairOrder(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */

export async function declineRepairOrderApprovalHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input = requireValidatedBody<DeclineRepairOrderApprovalInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await declineRepairOrderApproval(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}

//************************************************************** */

export async function completeRepairOrderPartsReviewHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } = requireValidatedParams<RepairOrderIdInput>(request);

  const input =
    requireValidatedBody<CompleteRepairOrderPartsReviewInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const repairOrder = await completeRepairOrderPartsReview(
    organizationId,
    repairOrderId,
    membershipId,
    input,
  );

  ok(response, repairOrder);
}
