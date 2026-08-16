import type {
  Response,
} from "express";

import {
  AppError,
} from "../../platform/errors/app-error.js";

import {
  getRequestContext,
} from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import {
  ok,
} from "../../platform/http/api-response.js";

import {
  adjustInventory,
  allocateInventory,
  cycleCountInventory,
  damageInventory,
  deallocateInventory,
  issueInventory,
  listInventoryTransactions,
  receiveInventory,
  returnInventory,
} from "./part-inventory.service.js";

import type {
  InventoryAdjustmentInput,
  InventoryAllocationInput,
  InventoryCycleCountInput,
  InventoryDamageInput,
  InventoryDeallocationInput,
  InventoryIssueInput,
  InventoryReceiptInput,
  InventoryReturnInput,
} from "./part-inventory.schemas.js";

import type {
  PartIdInput,
} from "./part.schemas.js";

//************************************************************** */

function requireOrganizationId(
  request: AuthenticatedRequest,
): string {
  const organizationId =
    request.params.organizationId;

  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new AppError(
      400,
      "A valid organization ID is required.",
      {
        code:
          "ORGANIZATION_ID_REQUIRED",
      },
    );
  }

  return organizationId;
}

//************************************************************** */

function getMembershipId(): string | null {
  const context =
    getRequestContext();

  return (
    context.membership?.id ??
    null
  );
}

//************************************************************** */

function requirePartId(
  request: AuthenticatedRequest,
): string {
  const {
    partId,
  } =
    requireValidatedParams<PartIdInput>(
      request,
    );

  return partId;
}

//************************************************************** */

export async function adjustInventoryHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const result =
    await adjustInventory(
      requireOrganizationId(request),
      requirePartId(request),
      getMembershipId(),
      requireValidatedBody<InventoryAdjustmentInput>(
        request,
      ),
    );

  ok(
    response,
    result,
  );
}

//************************************************************** */

export async function receiveInventoryHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const result =
    await receiveInventory(
      requireOrganizationId(request),
      requirePartId(request),
      getMembershipId(),
      requireValidatedBody<InventoryReceiptInput>(
        request,
      ),
    );

  ok(
    response,
    result,
  );
}

//************************************************************** */

export async function allocateInventoryHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const result =
    await allocateInventory(
      requireOrganizationId(request),
      requirePartId(request),
      getMembershipId(),
      requireValidatedBody<InventoryAllocationInput>(
        request,
      ),
    );

  ok(
    response,
    result,
  );
}

//************************************************************** */

export async function deallocateInventoryHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const result =
    await deallocateInventory(
      requireOrganizationId(request),
      requirePartId(request),
      getMembershipId(),
      requireValidatedBody<InventoryDeallocationInput>(
        request,
      ),
    );

  ok(
    response,
    result,
  );
}

//************************************************************** */

export async function issueInventoryHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const result =
    await issueInventory(
      requireOrganizationId(request),
      requirePartId(request),
      getMembershipId(),
      requireValidatedBody<InventoryIssueInput>(
        request,
      ),
    );

  ok(
    response,
    result,
  );
}

//************************************************************** */

export async function returnInventoryHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const result =
    await returnInventory(
      requireOrganizationId(request),
      requirePartId(request),
      getMembershipId(),
      requireValidatedBody<InventoryReturnInput>(
        request,
      ),
    );

  ok(
    response,
    result,
  );
}

//************************************************************** */

export async function damageInventoryHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const result =
    await damageInventory(
      requireOrganizationId(request),
      requirePartId(request),
      getMembershipId(),
      requireValidatedBody<InventoryDamageInput>(
        request,
      ),
    );

  ok(
    response,
    result,
  );
}

//************************************************************** */

export async function cycleCountInventoryHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const result =
    await cycleCountInventory(
      requireOrganizationId(request),
      requirePartId(request),
      getMembershipId(),
      requireValidatedBody<InventoryCycleCountInput>(
        request,
      ),
    );

  ok(
    response,
    result,
  );
}

//************************************************************** */

export async function listInventoryTransactionsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const transactions =
    await listInventoryTransactions(
      requireOrganizationId(request),
      requirePartId(request),
    );

  ok(
    response,
    transactions,
  );
}