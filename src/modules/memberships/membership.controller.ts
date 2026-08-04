import type { Response } from "express";
import { AppError } from "../../platform/errors/app-error.js";
import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { getRequestContext } from "../../platform/request/request.context.js";

import type { ValidatedRequest } from "../../platform/validation/validated-request.js";

import {
  getMembershipById,
  listMemberships,
  updateMembership,
} from "./membership.service.js";

import { ok } from "../../platform/http/api-response.js";

import type {
  ListMembershipsQueryInput,
  MembershipIdInput,
  UpdateMembershipInput,
} from "./membership.schemas.js";

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

// function requireMembershipId(request: AuthenticatedRequest): string {
//   const membershipId = request.params.membershipId;

//   if (typeof membershipId !== "string" || membershipId.trim().length === 0) {
//     throw new AppError(400, "A valid membership ID is required.", {
//       code: "MEMBERSHIP_ID_REQUIRED",
//     });
//   }

//   return membershipId;
// }

//************************************************************** */

export async function listMembershipsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const query = (
    request as ValidatedRequest<unknown, unknown, ListMembershipsQueryInput>
  ).validatedQuery;

  if (!query) {
    throw new AppError(500, "Validated query data is unavailable.", {
      code: "VALIDATED_QUERY_UNAVAILABLE",
    });
  }

  const memberships = await listMemberships(organizationId, {
    page: query.page,
    pageSize: query.pageSize,
  });

  ok(response, memberships);
}

//************************************************************** */

export async function getMembershipHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const params = (request as ValidatedRequest<unknown, MembershipIdInput>)
    .validatedParams;

  if (!params) {
    throw new AppError(500, "Validated route parameters are unavailable.", {
      code: "VALIDATED_PARAMS_UNAVAILABLE",
    });
  }

  const membershipId = params.membershipId;

  const membership = await getMembershipById(organizationId, membershipId);

  ok(response, membership);
}

//************************************************************** */

export async function updateMembershipHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const params = (request as ValidatedRequest<unknown, MembershipIdInput>)
    .validatedParams;

  if (!params) {
    throw new AppError(500, "Validated route parameters are unavailable.", {
      code: "VALIDATED_PARAMS_UNAVAILABLE",
    });
  }

  const membershipId = params.membershipId;

  const context = getRequestContext();

  if (!context.membership) {
    throw new AppError(403, "Organization membership is required.", {
      code: "ORGANIZATION_MEMBERSHIP_REQUIRED",
    });
  }

  const input = (request as ValidatedRequest<UpdateMembershipInput>)
    .validatedBody;

  if (!input) {
    throw new AppError(500, "Validated request body is unavailable.", {
      code: "VALIDATED_BODY_UNAVAILABLE",
    });
  }

  const membership = await updateMembership(
    organizationId,
    membershipId,
    {
      organizationId: context.membership.organizationId,
      membershipId: context.membership.id,
      role: context.membership.role,
    },
    {
      ...(input.role !== undefined
        ? {
            role: input.role,
          }
        : {}),

      ...(input.status !== undefined
        ? {
            status: input.status,
          }
        : {}),
    },
  );

  ok(response, membership);
}
