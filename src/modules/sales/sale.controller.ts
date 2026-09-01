import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import { created, ok } from "../../platform/http/api-response.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import {
  createPosSale,
  createSaleReturn,
  getSaleById,
  listSales,
} from "./sale.service.js";

import type {
  CreatePosSaleInput,
  CreateSaleReturnInput,
  ListSalesQueryInput,
  SaleIdInput,
} from "./sale.schemas.js";

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

export async function createPosSaleHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const input = requireValidatedBody<CreatePosSaleInput>(request);

  const context = getRequestContext();

  const cashierName =
    [context.user.firstName, context.user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || null;

  const sale = await createPosSale(organizationId, input, {
    membershipId: context.membership?.id ?? null,

    name: cashierName,
  });

  created(response, sale);
}

//************************************************************** */

export async function createSaleReturnHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { saleId } = requireValidatedParams<SaleIdInput>(request);

  const input = requireValidatedBody<CreateSaleReturnInput>(request);

  const context = getRequestContext();

  const processorName =
    [context.user.firstName, context.user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || null;

  const refund = await createSaleReturn(organizationId, saleId, input, {
    membershipId: context.membership?.id ?? null,

    name: processorName,
  });

  created(response, refund);
}

//************************************************************** */

export async function listSalesHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const query = requireValidatedQuery<ListSalesQueryInput>(request);

  const sales = await listSales(organizationId, query);

  ok(response, sales);
}

//************************************************************** */

export async function getSaleHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { saleId } = requireValidatedParams<SaleIdInput>(request);

  const sale = await getSaleById(organizationId, saleId);

  ok(response, sale);
}

//************************************************************** */
