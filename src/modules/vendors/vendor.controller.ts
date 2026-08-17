import type {
  Response,
} from "express";

import {
  AppError,
} from "../../platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import {
  created,
  ok,
} from "../../platform/http/api-response.js";

import {
  archiveVendor,
  createVendor,
  getVendorById,
  listVendors,
  updateVendor,
} from "./vendor.service.js";

import type {
  CreateVendorInput,
  ListVendorsQueryInput,
  UpdateVendorInput,
  VendorIdInput,
} from "./vendor.schemas.js";

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

export async function createVendorHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const input =
    requireValidatedBody<CreateVendorInput>(
      request,
    );

  const vendor =
    await createVendor(
      organizationId,
      input,
    );

  created(
    response,
    vendor,
  );
}

//************************************************************** */

export async function listVendorsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const query =
    requireValidatedQuery<ListVendorsQueryInput>(
      request,
    );

  const vendors =
    await listVendors(
      organizationId,
      query,
    );

  ok(
    response,
    vendors,
  );
}

//************************************************************** */

export async function getVendorHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    vendorId,
  } =
    requireValidatedParams<VendorIdInput>(
      request,
    );

  const vendor =
    await getVendorById(
      organizationId,
      vendorId,
    );

  ok(
    response,
    vendor,
  );
}

//************************************************************** */

export async function updateVendorHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    vendorId,
  } =
    requireValidatedParams<VendorIdInput>(
      request,
    );

  const input =
    requireValidatedBody<UpdateVendorInput>(
      request,
    );

  const vendor =
    await updateVendor(
      organizationId,
      vendorId,
      input,
    );

  ok(
    response,
    vendor,
  );
}

//************************************************************** */

export async function archiveVendorHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const {
    vendorId,
  } =
    requireValidatedParams<VendorIdInput>(
      request,
    );

  const vendor =
    await archiveVendor(
      organizationId,
      vendorId,
    );

  ok(
    response,
    vendor,
  );
}