import type {
  Response,
} from "express";

import { AppError } from "../../common/errors/app-error.js";
import type {
  AuthenticatedRequest,
} from "../auth/auth.middleware.js";
import type {
  UpdateMembershipInput,
} from "./membership.schemas.js";
import {
  getMembershipById,
  listMemberships,
  updateMembership,
} from "./membership.service.js";

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
        code: "ORGANIZATION_ID_REQUIRED",
      },
    );
  }

  return organizationId;
}

//************************************************************** */

function requireMembershipId(
  request: AuthenticatedRequest,
): string {
  const membershipId =
    request.params.membershipId;

  if (
    typeof membershipId !== "string" ||
    membershipId.trim().length === 0
  ) {
    throw new AppError(
      400,
      "A valid membership ID is required.",
      {
        code: "MEMBERSHIP_ID_REQUIRED",
      },
    );
  }

  return membershipId;
}

//************************************************************** */

export async function listMembershipsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const memberships =
    await listMemberships(organizationId);

  response.status(200).json({
    data: memberships,
  });
}

//************************************************************** */

export async function getMembershipHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const membershipId =
    requireMembershipId(request);

  const membership =
    await getMembershipById(
      organizationId,
      membershipId,
    );

  response.status(200).json({
    data: membership,
  });
}

//************************************************************** */

export async function updateMembershipHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId =
    requireOrganizationId(request);

  const membershipId =
    requireMembershipId(request);

  const input =
    request.body as UpdateMembershipInput;

const membership =
  await updateMembership(
    organizationId,
    membershipId,
    {
      ...(input.role !== undefined
        ? { role: input.role }
        : {}),
      ...(input.status !== undefined
        ? { status: input.status }
        : {}),
    },
  );

  response.status(200).json({
    data: membership,
  });
}