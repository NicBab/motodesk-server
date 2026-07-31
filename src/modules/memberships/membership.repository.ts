import { prisma } from "../../config/prisma.js";
import type {
  MembershipUpdateData,
} from "./membership.types.js";

//************************************************************** */

export async function findMembershipsByOrganization(
  organizationId: string,
) {
  return prisma.membership.findMany({
    where: {
      organizationId,
    },
    include: {
      user: true,
      organization: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

//************************************************************** */

export async function findMembershipById(
  organizationId: string,
  membershipId: string,
) {
  return prisma.membership.findFirst({
    where: {
      id: membershipId,
      organizationId,
    },
    include: {
      user: true,
      organization: true,
    },
  });
}

//************************************************************** */

export async function findMembershipForUpdate(
  organizationId: string,
  membershipId: string,
) {
  return prisma.membership.findFirst({
    where: {
      id: membershipId,
      organizationId,
    },
  });
}

//************************************************************** */

export async function updateMembershipRecord(
  membershipId: string,
  data: MembershipUpdateData,
) {
  return prisma.membership.update({
    where: {
      id: membershipId,
    },
    data: {
      ...(data.role !== undefined
        ? {
            role: data.role,
          }
        : {}),

      ...(data.status !== undefined
        ? {
            status: data.status,
          }
        : {}),
    },
    include: {
      user: true,
      organization: true,
    },
  });
}

//************************************************************** */