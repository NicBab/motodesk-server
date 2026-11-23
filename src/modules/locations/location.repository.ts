
import { prisma } from "../../config/prisma.js";

//************************************************************** */

export async function findLocationsByOrganization(
  organizationId: string,
) {
  return prisma.shopLocation.findMany({
    where: {
      organizationId,
    },

    select: {
      id: true,
      organizationId: true,
      name: true,
      code: true,
      email: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      timezone: true,
      isDefault: true,
      status: true,
      createdAt: true,
      updatedAt: true,

      _count: {
        select: {
          membershipLocations: true,
        },
      },
    },

    orderBy: [
      {
        isDefault: "desc",
      },
      {
        name: "asc",
      },
    ],
  });
}

//************************************************************** */

export async function findLocationById(
  organizationId: string,
  locationId: string,
) {
  return prisma.shopLocation.findFirst({
    where: {
      id: locationId,
      organizationId,
    },

    include: {
      membershipLocations: {
        where: {
          membership: {
            status: "ACTIVE",
          },
        },

        select: {
          membershipId: true,

          membership: {
            select: {
              id: true,
              role: true,
              status: true,

              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  jobTitle: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

//************************************************************** */

export async function findAvailableLocationEmployees(
  organizationId: string,
) {
  return prisma.membership.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
    },

    select: {
      id: true,
      role: true,

      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
        },
      },

      membershipLocations: {
        select: {
          shopLocationId: true,
        },
      },
    },

    orderBy: {
      user: {
        lastName: "asc",
      },
    },
  });
}

//************************************************************** */

export async function countActiveLocations(
  organizationId: string,
): Promise<number> {
  return prisma.shopLocation.count({
    where: {
      organizationId,
      status: "ACTIVE",
    },
  });
}

//************************************************************** */
