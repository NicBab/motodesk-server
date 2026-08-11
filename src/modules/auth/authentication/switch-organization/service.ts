import { AppError } from "../../../../platform/errors/app-error.js";

import { findUserForOrganizationSwitch } from "../../auth.repository.js";

import { generateAccessToken } from "../../tokens/jwt.service.js";

import type { SwitchOrganizationInput } from "./schema.js";

import type { AuthenticatedMembership } from "../../auth.types.js";

import { toAuthenticatedMembership } from "../../shared/mappers/membership.mapper.js";

//************************************************************** */

type SwitchOrganizationResult = {
  membership: AuthenticatedMembership;
  accessToken: string;
  accessTokenExpiresAt: Date;
};

//************************************************************** */

export async function switchOrganization(
  userId: string,
  sessionId: string,
  input: SwitchOrganizationInput,
): Promise<SwitchOrganizationResult> {
  const user = await findUserForOrganizationSwitch(
    userId,
    input.organizationId,
  );

  if (!user) {
    throw new AppError(401, "The authenticated user no longer exists.", {
      code: "AUTHENTICATED_USER_NOT_FOUND",
    });
  }

  if (!user.isActive) {
    throw new AppError(403, "This account is currently inactive.", {
      code: "ACCOUNT_INACTIVE",
    });
  }

  const membership = user.memberships[0] ?? null;

  if (!membership) {
    throw new AppError(
      403,
      "You do not have an active membership in this organization.",
      {
        code: "ORGANIZATION_MEMBERSHIP_REQUIRED",
      },
    );
  }

  const authenticatedMembership = toAuthenticatedMembership(membership);

  const accessToken = generateAccessToken({
    sub: user.id,
    email: user.email,
    sessionId,
    organizationId: authenticatedMembership.organizationId,
    membershipId: authenticatedMembership.id,
    role: authenticatedMembership.role,
  });

  return {
    membership: authenticatedMembership,
    accessToken: accessToken.token,
    accessTokenExpiresAt: accessToken.expiresAt,
  };
}

//************************************************************** */
