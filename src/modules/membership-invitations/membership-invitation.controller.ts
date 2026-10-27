import type { Response } from "express";

import type {
  MembershipInvitation,
} from "../../generated/prisma/client.js";

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
  requireValidatedQuery,
} from "../../platform/validation/validated-request.js";

import {
  created,
  ok,
} from "../../platform/http/api-response.js";

import {
  toMembershipRecord,
} from "../memberships/membership.utils.js";

import {
  acceptMembershipInvitation,
  createMembershipInvitation,
  revokeMembershipInvitation,
  listMembershipInvitations,
  refreshMembershipInvitation,
} from "./membership-invitation.service.js";

import type {
  AcceptMembershipInvitationInput,
  CreateMembershipInvitationInput,
  MembershipInvitationIdInput,
  ListMembershipInvitationsQueryInput,
} from "./membership-invitation.schemas.js";

//************************************************************** */

type PublicInvitationSource = Pick<
  MembershipInvitation,
  | "id"
  | "organizationId"
  | "invitedByMembershipId"
  | "email"
  | "role"
  | "expiresAt"
  | "acceptedAt"
  | "revokedAt"
  | "createdAt"
  | "updatedAt"
> & {
  employeeId?: string | null;
};

function toPublicInvitation(
  invitation: PublicInvitationSource,
) {
  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    invitedByMembershipId: invitation.invitedByMembershipId,

    ...(invitation.employeeId !== undefined
      ? { employeeId: invitation.employeeId }
      : {}),

    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
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

export async function listMembershipInvitationsHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const query =
    requireValidatedQuery<ListMembershipInvitationsQueryInput>(
      request,
    );

  const invitations = await listMembershipInvitations(
    organizationId,
    {
      page: query.page,
      pageSize: query.pageSize,
    },
  );

  ok(response, {
    items: invitations.items.map(toPublicInvitation),
    pagination: invitations.pagination,
  });
}

//************************************************************** */

export async function createMembershipInvitationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);
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

  const input =
    requireValidatedBody<CreateMembershipInvitationInput>(
      request,
    );

  const result = await createMembershipInvitation(
    organizationId,
    {
      organizationId: context.membership.organizationId,
      membershipId: context.membership.id,
      role: context.membership.role,
    },
    input.email,
    input.role,
    input.employeeId,
  );

  // The service explicitly constructs this response, including
  // the newly generated token used by the invitation workflow.
  created(response, result);
}

//************************************************************** */

export async function revokeMembershipInvitationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const params =
    requireValidatedParams<MembershipInvitationIdInput>(
      request,
    );

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

  const invitation = await revokeMembershipInvitation(
    organizationId,
    params.invitationId,
    {
      organizationId: context.membership.organizationId,
      membershipId: context.membership.id,
      role: context.membership.role,
    },
  );

  ok(response, toPublicInvitation(invitation));
}

//************************************************************** */

export async function refreshMembershipInvitationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const params =
    requireValidatedParams<MembershipInvitationIdInput>(
      request,
    );

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

  const result = await refreshMembershipInvitation(
    organizationId,
    params.invitationId,
    {
      organizationId: context.membership.organizationId,
      membershipId: context.membership.id,
      role: context.membership.role,
    },
  );

  // As with creation, this service explicitly constructs the
  // public invitation and newly generated replacement token.
  ok(response, result);
}

//************************************************************** */

export async function acceptMembershipInvitationHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const user = request.authenticatedUser;

  if (!user) {
    throw new AppError(
      401,
      "Authentication required.",
      {
        code: "AUTHENTICATION_REQUIRED",
      },
    );
  }

  const input =
    requireValidatedBody<AcceptMembershipInvitationInput>(
      request,
    );

  const membership = await acceptMembershipInvitation(
    input.token,
    user,
  );

  ok(response, {
    ...toMembershipRecord(membership),
    organizationName: membership.organization.name,
  });
}

//************************************************************** */