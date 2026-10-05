import type { Response } from "express";

import {
  AppError,
} from "../../platform/errors/app-error.js";

import {
  ok,
} from "../../platform/http/api-response.js";

import {
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import type {
  PlatformAdminRequest,
} from "./platform-admin.middleware.js";

import type {
  PlatformGrowthQueryInput,
  PlatformMembershipsQueryInput,
  PlatformOrganizationsQueryInput,
  PlatformOverviewQueryInput,
  PlatformUsersQueryInput,
} from "./platform-admin.schemas.js";

import {
  getPlatformGrowth,
  getPlatformOrganization,
  getPlatformOverview,
  getPlatformUser,
  listPlatformOrganizationMemberships,
  listPlatformOrganizations,
  listPlatformUserMemberships,
  listPlatformUsers,
} from "./platform-admin.service.js";

//************************************************************** */

function requireRouteId(
  request: PlatformAdminRequest,
  parameter: "organizationId" | "userId",
): string {
  const value = request.params[parameter];

  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new AppError(
      400,
      "A valid resource ID is required.",
      {
        code: "PLATFORM_RESOURCE_ID_REQUIRED",
      },
    );
  }

  return value;
}

//************************************************************** */

export async function getPlatformSessionHandler(
  request: PlatformAdminRequest,
  response: Response,
): Promise<void> {
  const user = request.authenticatedUser;
  const platformAdmin = request.authenticatedPlatformAdmin;

  if (!user || !platformAdmin) {
    throw new AppError(
      403,
      "Platform administrator access is required.",
      {
        code: "PLATFORM_ADMIN_ACCESS_REQUIRED",
      },
    );
  }

  ok(response, {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      emailVerifiedAt: user.emailVerifiedAt,
    },

    platformAdmin: {
      id: platformAdmin.id,
      role: platformAdmin.role,
    },
  });
}

//************************************************************** */

export async function getPlatformOverviewHandler(
  request: PlatformAdminRequest,
  response: Response,
): Promise<void> {
  const query =
    requireValidatedQuery<PlatformOverviewQueryInput>(
      request,
    );

  const overview = await getPlatformOverview(query);

  ok(response, overview);
}

//************************************************************** */

export async function getPlatformGrowthHandler(
  request: PlatformAdminRequest,
  response: Response,
): Promise<void> {
  const query =
    requireValidatedQuery<PlatformGrowthQueryInput>(
      request,
    );

  const growth = await getPlatformGrowth(query);

  ok(response, growth);
}

//************************************************************** */

export async function listPlatformOrganizationsHandler(
  request: PlatformAdminRequest,
  response: Response,
): Promise<void> {
  const query =
    requireValidatedQuery<PlatformOrganizationsQueryInput>(
      request,
    );

  const organizations = await listPlatformOrganizations(
    {
      page: query.page,
      pageSize: query.pageSize,
    },
    {
      ...(query.search !== undefined
        ? { search: query.search }
        : {}),

      ...(query.status !== undefined
        ? { status: query.status }
        : {}),
    },
  );

  ok(response, organizations);
}

//************************************************************** */

export async function getPlatformOrganizationHandler(
  request: PlatformAdminRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireRouteId(
    request,
    "organizationId",
  );

  const organization = await getPlatformOrganization(
    organizationId,
  );

  ok(response, organization);
}

//************************************************************** */

export async function listPlatformOrganizationMembershipsHandler(
  request: PlatformAdminRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireRouteId(
    request,
    "organizationId",
  );

  const query =
    requireValidatedQuery<PlatformMembershipsQueryInput>(
      request,
    );

  const memberships =
    await listPlatformOrganizationMemberships(
      organizationId,
      {
        page: query.page,
        pageSize: query.pageSize,
      },
    );

  ok(response, memberships);
}

//************************************************************** */

export async function listPlatformUsersHandler(
  request: PlatformAdminRequest,
  response: Response,
): Promise<void> {
  const query =
    requireValidatedQuery<PlatformUsersQueryInput>(
      request,
    );

  const users = await listPlatformUsers(
    {
      page: query.page,
      pageSize: query.pageSize,
    },
    {
      ...(query.search !== undefined
        ? { search: query.search }
        : {}),

      ...(query.isActive !== undefined
        ? { isActive: query.isActive }
        : {}),
    },
  );

  ok(response, users);
}

//************************************************************** */

export async function getPlatformUserHandler(
  request: PlatformAdminRequest,
  response: Response,
): Promise<void> {
  const userId = requireRouteId(request, "userId");

  const user = await getPlatformUser(userId);

  ok(response, user);
}

//************************************************************** */

export async function listPlatformUserMembershipsHandler(
  request: PlatformAdminRequest,
  response: Response,
): Promise<void> {
  const userId = requireRouteId(request, "userId");

  const query =
    requireValidatedQuery<PlatformMembershipsQueryInput>(
      request,
    );

  const memberships = await listPlatformUserMemberships(
    userId,
    {
      page: query.page,
      pageSize: query.pageSize,
    },
  );

  ok(response, memberships);
}

//************************************************************** */