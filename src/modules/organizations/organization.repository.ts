import { prisma } from "../../config/prisma.js";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from "./organization.types.js";
import { runTransaction } from "../../platform/database/repository.js";

//************************************************************** */

export async function findOrganizationBySlug(
  slug: string,
) {
  return prisma.organization.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
    },
  });
}

//************************************************************** */

export async function findOrganizationById(
  organizationId: string,
) {
  return prisma.organization.findUnique({
    where: {
      id: organizationId,
    },
  });
}

//************************************************************** */

export async function createOrganizationWithOwner(
  input: CreateOrganizationInput,
) {
  return runTransaction(
    async (transaction) => {
      const organization =
        await transaction.organization.create({
          data: {
            name: input.name,
            slug: input.slug,

            ...(input.email !== undefined
              ? {
                  email: input.email,
                }
              : {}),

            ...(input.phone !== undefined
              ? {
                  phone: input.phone,
                }
              : {}),
          },
        });

      await transaction.membership.create({
        data: {
          userId: input.ownerUserId,
          organizationId:
            organization.id,
          role: "OWNER",
          status: "ACTIVE",
        },
      });

      return organization;
    },
  );
}

//************************************************************** */

export async function updateOrganizationRecord(
  organizationId: string,
  data: UpdateOrganizationInput,
) {
  return prisma.organization.update({
    where: {
      id: organizationId,
    },
    data: {
      ...(data.name !== undefined
        ? {
            name: data.name,
          }
        : {}),

      ...(data.email !== undefined
        ? {
            email: data.email,
          }
        : {}),

      ...(data.phone !== undefined
        ? {
            phone: data.phone,
          }
        : {}),
    },
  });
}

//************************************************************** */

export async function findOrganizationsForUser(
  userId: string,
) {
  return prisma.membership.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      role: true,
      status: true,
      createdAt: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          email: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
}