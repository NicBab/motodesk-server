import type {
  Response,
} from "express";

import { AppError } from "../../platform/errors/app-error.js";

import {
  created,
  ok,
} from "../../platform/http/api-response.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import {
  archiveCustomer,
  createCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
  restoreCustomer,
} from "./customer.service.js";

import type {
  CreateCustomerInput,
  CustomerIdInput,
  ListCustomersQueryInput,
  UpdateCustomerInput,
} from "./customer.schemas.js";

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

export async function createCustomerHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const input =
    requireValidatedBody<CreateCustomerInput>(
      request,
    );

  const customer =
    await createCustomer(
      organizationId,
      input,
    );

  created(response, customer);
}

//************************************************************** */

export async function listCustomersHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const query =
    requireValidatedQuery<ListCustomersQueryInput>(
      request,
    );

  const customers =
    await listCustomers(
      organizationId,
      query,
    );

  ok(response, customers);
}

//************************************************************** */

export async function getCustomerHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const { customerId } =
    requireValidatedParams<CustomerIdInput>(
      request,
    );

  const customer =
    await getCustomerById(
      organizationId,
      customerId,
    );

  ok(response, customer);
}

//************************************************************** */

export async function updateCustomerHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const { customerId } =
    requireValidatedParams<CustomerIdInput>(
      request,
    );

  const input =
    requireValidatedBody<UpdateCustomerInput>(
      request,
    );

  const customer =
    await updateCustomer(
      organizationId,
      customerId,
      input,
    );

  ok(response, customer);
}

//************************************************************** */

export async function archiveCustomerHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const { customerId } =
    requireValidatedParams<CustomerIdInput>(
      request,
    );

  const customer =
    await archiveCustomer(
      organizationId,
      customerId,
    );

  ok(response, customer);
}

//************************************************************** */

export async function restoreCustomerHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const { customerId } =
    requireValidatedParams<CustomerIdInput>(
      request,
    );

  const customer =
    await restoreCustomer(
      organizationId,
      customerId,
    );

  ok(response, customer);
}

//************************************************************** */