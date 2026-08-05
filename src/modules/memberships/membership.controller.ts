import type { Response } from "express";
import { AppError } from "../../platform/errors/app-error.js";
import type { AuthenticatedRequest } from "../auth/index.js";
import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

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

export async function listMembershipsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const query =
    requireValidatedQuery<ListMembershipsQueryInput>(
      request,
    );

  const memberships =
    await listMemberships(
      organizationId,
      {
        page: query.page,
        pageSize: query.pageSize,
      },
    );

  ok(response, memberships);
}

//************************************************************** */

export async function getMembershipHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const params =
    requireValidatedParams<MembershipIdInput>(
      request,
    );

  const membership =
    await getMembershipById(
      organizationId,
      params.membershipId,
    );

  ok(response, membership);
}

//************************************************************** */

export async function updateMembershipHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const params =
    requireValidatedParams<MembershipIdInput>(
      request,
    );

  const context =
    getRequestContext();

  if (!context.membership) {
    throw new AppError(
      403,
      "Organization membership is required.",
      {
        code:
          "ORGANIZATION_MEMBERSHIP_REQUIRED",
      },
    );
  }

  const input =
    requireValidatedBody<UpdateMembershipInput>(
      request,
    );

  const membership =
    await updateMembership(
      organizationId,
      params.membershipId,
      {
        organizationId:
          context.membership.organizationId,
        membershipId:
          context.membership.id,
        role:
          context.membership.role,
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

//************************************************************** */