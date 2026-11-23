
import {
  MembershipStatus,
  ShopLocationStatus,
} from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import { AppError } from "../../platform/errors/app-error.js";

import {
  lockOrganizationUserCapacity,
} from "../billing/billing-capacity.service.js";

//************************************************************** */

export async function replaceLocationEmployeeAssignments(
  organizationId: string,
  locationId: string,
  membershipIds: string[],
) {
  return prisma.$transaction(async (transaction) => {
    // Serialize assignment changes for this organization.

    await lockOrganizationUserCapacity(
      transaction,
      organizationId,
    );

    // Verify the location belongs to this organization
    // and is currently active.

    const location = await transaction.shopLocation.findFirst({
      where: {
        id: locationId,
        organizationId,
        status: ShopLocationStatus.ACTIVE,
      },

      select: {
        id: true,
      },
    });

    if (!location) {
      throw new AppError(
        404,
        "Active shop location not found.",
        {
          code: "SHOP_LOCATION_NOT_FOUND",
        },
      );
    }

    // Reject duplicate membership IDs.

    const uniqueMembershipIds = [...new Set(membershipIds)];

    if (uniqueMembershipIds.length !== membershipIds.length) {
      throw new AppError(
        400,
        "Duplicate employee assignments are not allowed.",
        {
          code: "DUPLICATE_LOCATION_EMPLOYEE",
        },
      );
    }

    // Every employee must be an active membership
    // of the same organization.

    const memberships = await transaction.membership.findMany({
      where: {
        organizationId,
        id: {
          in: uniqueMembershipIds,
        },
        status: MembershipStatus.ACTIVE,
        user: {
          isActive: true,
        },
      },

      select: {
        id: true,
      },
    });

    if (memberships.length !== uniqueMembershipIds.length) {
      throw new AppError(
        400,
        "One or more employees are not active members of this organization.",
        {
          code: "INVALID_LOCATION_EMPLOYEE",
        },
      );
    }

    // Replace this location's assignments atomically.
    // An empty list clears its assignments.

    await transaction.membershipLocation.deleteMany({
      where: {
        organizationId,
        shopLocationId: locationId,
      },
    });

    if (uniqueMembershipIds.length > 0) {
      await transaction.membershipLocation.createMany({
        data: uniqueMembershipIds.map((membershipId) => ({
          organizationId,
          shopLocationId: locationId,
          membershipId,
        })),
      });
    }

    return transaction.membershipLocation.findMany({
      where: {
        organizationId,
        shopLocationId: locationId,
      },

      select: {
        id: true,
        organizationId: true,
        membershipId: true,
        shopLocationId: true,
        createdAt: true,
      },

      orderBy: {
        createdAt: "asc",
      },
    });
  });
}

//************************************************************** */
