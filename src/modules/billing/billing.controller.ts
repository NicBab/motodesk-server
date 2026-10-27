import type { Response } from "express";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  ok,
} from "../../platform/http/api-response.js";

import {
  requireValidatedBody,
} from "../../platform/validation/validated-request.js";

import {
  createOrganizationBillingCheckout,
} from "./billing-checkout.service.js";

import {
  getOrganizationBillingOverview,
} from "./billing-overview.service.js";

import {
  createOrganizationBillingPortal,
} from "./billing-portal.service.js";

import {
  previewOrganizationBillingUserCapacity,
} from "./billing-user-capacity-preview.service.js";

import {
  confirmOrganizationBillingUserCapacity,
} from "./billing-user-capacity-confirm.service.js";

import type {
  CreateBillingCheckoutInput,
  CreateBillingUserCapacityPreviewInput,
  ConfirmBillingUserCapacityChangeInput,
} from "./billing.schemas.js";

//************************************************************** */

function requireBillingRequestContext(
  request: AuthenticatedRequest,
): {
  organizationId: string;
  userId: string;
} {
  const userId = request.authenticatedUser?.id;

  if (!userId) {
    throw new AppError(
      401,
      "Authentication required.",
      {
        code: "AUTHENTICATION_REQUIRED",
      },
    );
  }

  const organizationId = request.params.organizationId;

  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new AppError(
      400,
      "A valid organization ID is required.",
      {
        code: "ORGANIZATION_ID_REQUIRED",
      },
    );
  }

  return {
    organizationId,
    userId,
  };
}

//************************************************************** */

export async function getBillingOverviewHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const { organizationId, userId } =
    requireBillingRequestContext(request);

  const result = await getOrganizationBillingOverview(
    organizationId,
    userId,
  );

  ok(response, result);
}

//************************************************************** */

export async function createBillingCheckoutHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const { organizationId, userId } =
    requireBillingRequestContext(request);

  const input =
    requireValidatedBody<CreateBillingCheckoutInput>(
      request,
    );

  const result = await createOrganizationBillingCheckout(
    organizationId,
    userId,
    input,
  );

  ok(response, result);
}

//************************************************************** */

export async function createBillingPortalHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const { organizationId, userId } =
    requireBillingRequestContext(request);

  const result = await createOrganizationBillingPortal(
    organizationId,
    userId,
  );

  ok(response, result);
}

//************************************************************** */

export async function previewBillingUserCapacityHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const { organizationId, userId } =
    requireBillingRequestContext(request);

  const input =
    requireValidatedBody<CreateBillingUserCapacityPreviewInput>(
      request,
    );

  const result = await previewOrganizationBillingUserCapacity(
    organizationId,
    userId,
    input,
  );

  ok(response, result);
}

//************************************************************** */

export async function confirmBillingUserCapacityHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const { organizationId, userId } =
    requireBillingRequestContext(request);

  const input =
    requireValidatedBody<ConfirmBillingUserCapacityChangeInput>(
      request,
    );

  const result = await confirmOrganizationBillingUserCapacity(
    organizationId,
    userId,
    input,
  );

  ok(response, result);
}

//************************************************************** */