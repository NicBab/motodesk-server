import { prisma } from "../../config/prisma.js";

import type {
  MembershipUpdateData,
} from "./membership.types.js";

import type {
  PaginationInput,
} from "../../platform/http/pagination.js";

import {
  buildPagination,
} from "../../platform/database/repository.js";

import type {
  Permission,
} from "../permissions/permission.constants.js";

//************************************************************** */

export async function findMembershipsByOrganization(
  organizationId: string,
  pagination?: PaginationInput,
) {
  return prisma.membership.findMany({
    where: {
      organizationId,
    },

    ...(pagination !== undefined
      ? buildPagination(
          pagination.page,
          pagination.pageSize,
        )
      : {}),

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

export async function countMembershipsByOrganization(
  organizationId: string,
): Promise<number> {
  return prisma.membership.count({
    where: {
      organizationId,
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

export async function updateMembershipRoleAndPermissions(
  organizationId: string,
  membershipId: string,
  data: MembershipUpdateData,
  permissions: Permission[],
  grantedByMembershipId: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const membership =
        await transaction.membership.update({
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

      await transaction.membershipPermission.deleteMany({
        where: {
          organizationId,
          membershipId,
        },
      });

      if (permissions.length > 0) {
        await transaction.membershipPermission.createMany({
          data: permissions.map(
            (permission) => ({
              organizationId,
              membershipId,
              permission,
              grantedByMembershipId,
            }),
          ),
        });
      }

      return membership;
    },
  );
}

//************************************************************** */









// import { prisma } from "../../config/prisma.js";
// import type {
//   MembershipUpdateData,
// } from "./membership.types.js";

// import type {
//   PaginationInput,
// } from "../../platform/http/pagination.js";

// import {
//   buildPagination,
// } from "../../platform/database/repository.js";

// //************************************************************** */

// export async function findMembershipsByOrganization(
//   organizationId: string,
//   pagination?: PaginationInput,
// ) {
//   return prisma.membership.findMany({
//     where: {
//       organizationId,
//     },

//     ...(pagination !== undefined
//       ? buildPagination(
//           pagination.page,
//           pagination.pageSize,
//         )
//       : {}),

//     include: {
//       user: true,
//       organization: true,
//     },

//     orderBy: {
//       createdAt: "asc",
//     },
//   });
// }

// //************************************************************** */

// export async function countMembershipsByOrganization(
//   organizationId: string,
// ): Promise<number> {
//   return prisma.membership.count({
//     where: {
//       organizationId,
//     },
//   });
// }
// //************************************************************** */

// export async function findMembershipById(
//   organizationId: string,
//   membershipId: string,
// ) {
//   return prisma.membership.findFirst({
//     where: {
//       id: membershipId,
//       organizationId,
//     },
//     include: {
//       user: true,
//       organization: true,
//     },
//   });
// }

// //************************************************************** */

// export async function findMembershipForUpdate(
//   organizationId: string,
//   membershipId: string,
// ) {
//   return prisma.membership.findFirst({
//     where: {
//       id: membershipId,
//       organizationId,
//     },
//   });
// }

// //************************************************************** */

// export async function updateMembershipRecord(
//   membershipId: string,
//   data: MembershipUpdateData,
// ) {
//   return prisma.membership.update({
//     where: {
//       id: membershipId,
//     },
//     data: {
//       ...(data.role !== undefined
//         ? {
//             role: data.role,
//           }
//         : {}),

//       ...(data.status !== undefined
//         ? {
//             status: data.status,
//           }
//         : {}),
//     },
//     include: {
//       user: true,
//       organization: true,
//     },
//   });
// }

// //************************************************************** */