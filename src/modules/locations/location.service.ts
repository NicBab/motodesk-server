
import { MembershipRole } from "../../generated/prisma/client.js";

import { AppError } from "../../platform/errors/app-error.js";

import type {
  MembershipActorContext,
} from "../memberships/membership.types.js";

import {
  findLocationsByOrganization,
  findLocationById,
  findAvailableLocationEmployees,
  countActiveLocations,
} from "./location.repository.js";


import type {
  CreateShopLocationInput,
} from "./location.types.js";

import {
  createShopLocationRecord,
} from "./location-write.repository.js";

import {
  replaceLocationEmployeeAssignments,
} from "./location-assignment.repository.js";

//************************************************************** */

function assertLocationManagementAccess(
  organizationId: string,
  actor: MembershipActorContext,
): void {
  if (actor.organizationId !== organizationId) {
    throw new AppError(
      403,
      "You cannot manage locations for another organization.",
      {
        code: "CROSS_ORGANIZATION_ACCESS_FORBIDDEN",
      },
    );
  }

  if (
    actor.role !== MembershipRole.OWNER &&
    actor.role !== MembershipRole.ADMIN
  ) {
    throw new AppError(
      403,
      "Only organization owners and administrators can manage locations.",
      {
        code: "LOCATION_MANAGEMENT_FORBIDDEN",
      },
    );
  }
}

//************************************************************** */

export async function getOrganizationLocations(
  organizationId: string,
  actor: MembershipActorContext,
) {
  assertLocationManagementAccess(organizationId, actor);

  return findLocationsByOrganization(organizationId);
}

//************************************************************** */

export async function getOrganizationLocation(
  organizationId: string,
  locationId: string,
  actor: MembershipActorContext,
) {
  assertLocationManagementAccess(organizationId, actor);

  const location = await findLocationById(
    organizationId,
    locationId,
  );

  if (!location) {
    throw new AppError(404, "Shop location not found.", {
      code: "SHOP_LOCATION_NOT_FOUND",
    });
  }

  return location;
}

//************************************************************** */

export async function getOrganizationLocationEmployees(
  organizationId: string,
  actor: MembershipActorContext,
) {
  assertLocationManagementAccess(organizationId, actor);

  return findAvailableLocationEmployees(organizationId);
}

//************************************************************** */

export async function getOrganizationLocationCount(
  organizationId: string,
  actor: MembershipActorContext,
): Promise<number> {
  assertLocationManagementAccess(organizationId, actor);

  return countActiveLocations(organizationId);
}


//************************************************************** */

export async function createOrganizationLocation(
  organizationId: string,
  input: CreateShopLocationInput,
  actor: MembershipActorContext,
) {
  if (
    actor.organizationId !== organizationId ||
    actor.role !== MembershipRole.OWNER
  ) {
    throw new AppError(
      403,
      "Only the organization owner can create shop locations.",
      {
        code: "LOCATION_CREATION_FORBIDDEN",
      },
    );
  }

  const name = input.name?.trim();
  const code = input.code?.trim().toUpperCase();

  if (!name || name.length > 120) {
    throw new AppError(
      400,
      "Location name must contain 1–120 characters.",
      {
        code: "INVALID_LOCATION_NAME",
      },
    );
  }

  if (!code || !/^[A-Z0-9_-]{2,30}$/.test(code)) {
    throw new AppError(
      400,
      "Location code must contain 2–30 letters, numbers, underscores, or hyphens.",
      {
        code: "INVALID_LOCATION_CODE",
      },
    );
  }

  return createShopLocationRecord(organizationId, {
    ...input,
    name,
    code,
  });
}

//************************************************************** */

export async function assignOrganizationLocationEmployees(
  organizationId: string,
  locationId: string,
  membershipIds: string[],
  actor: MembershipActorContext,
) {
  if (
    actor.organizationId !== organizationId ||
    actor.role !== MembershipRole.OWNER
  ) {
    throw new AppError(
      403,
      "Only the organization owner can assign employees to locations.",
      {
        code: "LOCATION_ASSIGNMENT_FORBIDDEN",
      },
    );
  }

  if (
    !Array.isArray(membershipIds) ||
    membershipIds.length > 500 ||
    !membershipIds.every(
      (id) => typeof id === "string" && id.trim().length > 0,
    )
  ) {
    throw new AppError(
      400,
      "Employee assignments must contain valid membership IDs.",
      {
        code: "INVALID_LOCATION_ASSIGNMENTS",
      },
    );
  }

  return replaceLocationEmployeeAssignments(
    organizationId,
    locationId,
    membershipIds,
  );
}

//************************************************************** */
