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
  createPurchaseOrder,
  getPurchaseOrderById,
  listPurchaseOrders,
  orderPurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrderLine,
  cancelPurchaseOrder,
} from "./purchase-order.service.js";

import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQueryInput,
  PurchaseOrderIdInput,
  UpdatePurchaseOrderInput,
  ReceivePurchaseOrderLineInput,
  CancelPurchaseOrderInput,
} from "./purchase-order.schemas.js";

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

export async function createPurchaseOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const input = requireValidatedBody<CreatePurchaseOrderInput>(request);

  const purchaseOrder = await createPurchaseOrder(organizationId, input);

  created(response, purchaseOrder);
}

//************************************************************** */

export async function listPurchaseOrdersHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const query = requireValidatedQuery<ListPurchaseOrdersQueryInput>(request);

  const purchaseOrders = await listPurchaseOrders(organizationId, query);

  ok(response, purchaseOrders);
}

//************************************************************** */

export async function getPurchaseOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { purchaseOrderId } =
    requireValidatedParams<PurchaseOrderIdInput>(request);

  const purchaseOrder = await getPurchaseOrderById(
    organizationId,
    purchaseOrderId,
  );

  ok(response, purchaseOrder);
}

//************************************************************** */

export async function orderPurchaseOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { purchaseOrderId } =
    requireValidatedParams<PurchaseOrderIdInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const purchaseOrder = await orderPurchaseOrder(
    organizationId,
    purchaseOrderId,
    membershipId,
  );

  ok(response, purchaseOrder);
}

//************************************************************** */

export async function receivePurchaseOrderLineHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { purchaseOrderId } =
    requireValidatedParams<PurchaseOrderIdInput>(request);

  const input = requireValidatedBody<ReceivePurchaseOrderLineInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const purchaseOrder = await receivePurchaseOrderLine(
    organizationId,
    purchaseOrderId,
    membershipId,
    input,
  );

  ok(response, purchaseOrder);
}

//************************************************************** */

export async function updatePurchaseOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { purchaseOrderId } =
    requireValidatedParams<PurchaseOrderIdInput>(request);

  const input = requireValidatedBody<UpdatePurchaseOrderInput>(request);

  const purchaseOrder = await updatePurchaseOrder(
    organizationId,
    purchaseOrderId,
    input,
  );

  ok(response, purchaseOrder);
}

//************************************************************** */

export async function cancelPurchaseOrderHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { purchaseOrderId } =
    requireValidatedParams<PurchaseOrderIdInput>(request);

  const input = requireValidatedBody<CancelPurchaseOrderInput>(request);

  const membershipId = getRequestContext().membership?.id ?? null;

  const purchaseOrder = await cancelPurchaseOrder(
    organizationId,
    purchaseOrderId,
    membershipId,
    input,
  );

  ok(response, purchaseOrder);
}
