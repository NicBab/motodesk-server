
import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type {
  AuthenticatedRequest,
} from "../auth/index.js";

import {
  getRequestContext,
} from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import {
  created,
  ok,
  list,
} from "../../platform/http/api-response.js";

import type {
  MembershipActorContext,
} from "../memberships/membership.types.js";

import type {
  CreateShopLocationInput,
  AssignLocationEmployeesInput,
} from "./location.types.js";

import {
  getOrganizationLocations,
  getOrganizationLocation,
  getOrganizationLocationEmployees,
  createOrganizationLocation,
  assignOrganizationLocationEmployees,
} from "./location.service.js";

//************************************************************** */

interface LocationIdParams {
  locationId: string;
}

//************************************************************** */

function requireOrganizationId(
  request: AuthenticatedRequest,
): string {
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

  return organizationId;
}

//************************************************************** */

function requireLocationActor(): MembershipActorContext {
  const context = getRequestContext();

  if (!context.membership) {
    throw new AppError(
      403,
      "Organization membership is required.",
      {
        code: "ORGANIZATION_MEMBERSHIP_REQUIRED",
      },
    );
  }

  return {
    organizationId: context.membership.organizationId,
    membershipId: context.membership.id,
    role: context.membership.role,
  };
}

//************************************************************** */

export async function listLocationsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);
  const actor = requireLocationActor();

  const locations = await getOrganizationLocations(
    organizationId,
    actor,
  );

  list(response, locations);
}

//************************************************************** */

export async function getLocationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);
  const actor = requireLocationActor();

  const params = requireValidatedParams<LocationIdParams>(
    request,
  );

  const location = await getOrganizationLocation(
    organizationId,
    params.locationId,
    actor,
  );

  ok(response, location);
}

//************************************************************** */

export async function listLocationEmployeesHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);
  const actor = requireLocationActor();

  const employees = await getOrganizationLocationEmployees(
    organizationId,
    actor,
  );

  list(response, employees);
}

//************************************************************** */

export async function createLocationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);
  const actor = requireLocationActor();

  const input = requireValidatedBody<CreateShopLocationInput>(
    request,
  );

  const location = await createOrganizationLocation(
    organizationId,
    input,
    actor,
  );

  created(response, location);
}

//************************************************************** */

export async function assignLocationEmployeesHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);
  const actor = requireLocationActor();

  const params = requireValidatedParams<LocationIdParams>(
    request,
  );

  const input =
    requireValidatedBody<AssignLocationEmployeesInput>(
      request,
    );

  if (input.locationId !== params.locationId) {
    throw new AppError(
      400,
      "Location ID does not match the request path.",
      {
        code: "LOCATION_ID_MISMATCH",
      },
    );
  }

  const assignments =
    await assignOrganizationLocationEmployees(
      organizationId,
      params.locationId,
      input.membershipIds,
      actor,
    );

  ok(response, assignments);
}

//************************************************************** */
