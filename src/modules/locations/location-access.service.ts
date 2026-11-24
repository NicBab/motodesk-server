import { prisma } from "../../config/prisma.js";
import { AppError } from "../../platform/errors/app-error.js";
import type { MembershipActorContext } from "../memberships/membership.types.js";

//************************************************************** */

function accessDenied(): AppError {
  return new AppError(403, "You do not have access to this shop location.", {
    code: "SHOP_LOCATION_ACCESS_DENIED",
  });
}

//************************************************************** */

export async function listAccessibleShopLocations(
  organizationId: string,
  actor: MembershipActorContext,
) {
  if (actor.organizationId !== organizationId) {
    throw accessDenied();
  }

  const membership = await prisma.membership.findFirst({
    where: {
      id: actor.membershipId,
      organizationId,
      status: "ACTIVE",
      user: { isActive: true },
      organization: { status: "ACTIVE" },
    },
    select: { id: true, role: true },
  });

  if (!membership) {
    throw accessDenied();
  }

  return prisma.shopLocation.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      organization: {
        status: "ACTIVE",
        memberships: {
          some: {
            id: membership.id,
            role: membership.role,
            status: "ACTIVE",
            user: { isActive: true },
          },
        },
      },
      ...(membership.role === "OWNER"
        ? {}
        : {
            membershipLocations: {
              some: {
                organizationId,
                membershipId: membership.id,
              },
            },
          }),
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
      code: true,
      timezone: true,
      isDefault: true,
      status: true,
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }, { id: "asc" }],
  });
}

//************************************************************** */

export async function requireShopLocationAccess(
  organizationId: string,
  locationId: string,
  actor: MembershipActorContext,
) {
  if (typeof locationId !== "string" || !locationId.trim()) {
    throw new AppError(400, "A valid shop location ID is required.", {
      code: "SHOP_LOCATION_ID_REQUIRED",
    });
  }

  const locations = await listAccessibleShopLocations(organizationId, actor);
  const location = locations.find((item) => item.id === locationId);

  if (!location) {
    throw accessDenied();
  }

  return location;
}

//************************************************************** */
