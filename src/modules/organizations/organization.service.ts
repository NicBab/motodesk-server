import {
  MembershipRole,
  MembershipStatus,
} from "../../generated/prisma/client.js";

import { AppError } from "../../common/errors/app-error.js";
import { prisma } from "../../config/prisma.js";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../audit/audit.constants.js";
import { createAuditLog } from "../audit/audit.service.js";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from "./organization.types.js";

//************************************************************** */
export async function createOrganization(
  input: CreateOrganizationInput,
) {
  const existingOrganization =
    await prisma.organization.findUnique({
      where: {
        slug: input.slug,
      },
      select: {
        id: true,
      },
    });

if (existingOrganization) {
  throw new AppError(
    409,
    "An organization with this slug already exists.",
    {
      code: "ORGANIZATION_SLUG_TAKEN",
    },
  );
}

  const organization = await prisma.$transaction(
    async (tx) => {
      const createdOrganization =
        await tx.organization.create({
          data: {
            name: input.name,
            slug: input.slug,

            ...(input.phone !== undefined
              ? {
                  phone: input.phone,
                }
              : {}),

            ...(input.email !== undefined
              ? {
                  email: input.email,
                }
              : {}),
          },
        });

      await tx.membership.create({
        data: {
          organizationId:
            createdOrganization.id,
          userId: input.ownerUserId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      return createdOrganization;
    },
  );

  await createAuditLog({
    action:
      AUDIT_ACTIONS.ORGANIZATION_CREATED,
    entityType:
      AUDIT_ENTITY_TYPES.ORGANIZATION,
    entityId: organization.id,
    actor: {
      userId: input.ownerUserId,
      organizationId: organization.id,
    },
    after: organization,
  });

  return organization;
}

//************************************************************** */
export async function getOrganizationById(
  organizationId: string,
) {
  const organization =
    await prisma.organization.findUnique({
      where: {
        id: organizationId,
      },
    });

if (!organization) {
  throw new AppError(
    404,
    "Organization not found.",
    {
      code: "ORGANIZATION_NOT_FOUND",
    },
  );
}

  return organization;
}

//************************************************************** */

export async function getOrganizationsForUser(
  userId: string,
) {
  return prisma.membership.findMany({
    where: {
      userId,
      status: MembershipStatus.ACTIVE,
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

//************************************************************** */
export async function updateOrganization(
  organizationId: string,
  input: UpdateOrganizationInput,
  actorUserId: string,
) {
  const existingOrganization =
    await getOrganizationById(
      organizationId,
    );

  const updatedOrganization =
    await prisma.organization.update({
      where: {
        id: organizationId,
      },
      data: {
        ...(input.name !== undefined
          ? {
              name: input.name,
            }
          : {}),

        ...(input.phone !== undefined
          ? {
              phone: input.phone,
            }
          : {}),

        ...(input.email !== undefined
          ? {
              email: input.email,
            }
          : {}),
      },
    });

  await createAuditLog({
    action:
      AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    entityType:
      AUDIT_ENTITY_TYPES.ORGANIZATION,
    entityId: organizationId,
    actor: {
      userId: actorUserId,
      organizationId,
    },
    before: existingOrganization,
    after: updatedOrganization,
  });

  return updatedOrganization;
}

//************************************************************** */