import { AppError } from "../../platform/errors/app-error.js";
import { membershipPermissionsRepository } from "./membership-permissions.repository.js";

export const membershipPermissionsService = {
  async getMembershipPermissions(
    organizationId: string,
    membershipId: string
  ) {
    const membership =
      await membershipPermissionsRepository.findMembership(
        organizationId,
        membershipId
      );

    if (!membership) {
      throw new AppError(
        404,
        "Membership not found.",
        {
          code: "MEMBERSHIP_NOT_FOUND",
        }
      );
    }

    return membershipPermissionsRepository.findPermissions(
      organizationId,
      membershipId
    );
  },

  async updateMembershipPermissions(
    organizationId: string,
    membershipId: string,
    grantedByMembershipId: string,
    permissions: string[]
  ) {
    const membership =
      await membershipPermissionsRepository.findMembership(
        organizationId,
        membershipId
      );

    if (!membership) {
      throw new AppError(
        404,
        "Membership not found.",
        {
          code: "MEMBERSHIP_NOT_FOUND",
        }
      );
    }

    if (membership.role === "OWNER") {
      throw new AppError(
        403,
        "Owner permissions cannot be modified.",
        {
          code: "OWNER_PERMISSIONS_IMMUTABLE",
        }
      );
    }

    const uniquePermissions = [...new Set(permissions)];

    return membershipPermissionsRepository.replacePermissions(
      organizationId,
      membershipId,
      uniquePermissions,
      grantedByMembershipId
    );
  },
};