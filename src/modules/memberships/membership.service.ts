import { AppError } from "../../platform/errors/app-error.js";

import {
  assertMembershipCreateAllowed,
  assertMembershipUpdateAllowed,
} from "./membership.policy.js";

import {
  countMembershipsByOrganization,
  createMembershipWithPermissions,
  findMembershipById,
  findMembershipByUserAndOrganization,
  findMembershipForUpdate,
  findMembershipsByOrganization,
  findUserForMembershipByEmail,
  updateMembershipRecord,
  updateMembershipRoleAndPermissions,
} from "./membership.repository.js";

import type {
  MembershipActorContext,
  MembershipListItem,
  MembershipRecord,
  MembershipUpdateData,
} from "./membership.types.js";

import {
  toMembershipListItem,
  toMembershipRecord,
} from "./membership.utils.js";

import {
  createPaginatedData,
  type PaginatedData,
  type PaginationInput,
} from "../../platform/http/pagination.js";

import {
  getPermissionsForRole,
} from "../permissions/permission.utils.js";

import type {
  MembershipRole,
} from "../../generated/prisma/client.js";

//************************************************************** */

export async function listMemberships(
  organizationId: string,
  pagination: PaginationInput,
): Promise<PaginatedData<MembershipListItem>> {
  const [
    memberships,
    totalItems,
  ] = await Promise.all([
    findMembershipsByOrganization(
      organizationId,
      pagination,
    ),

    countMembershipsByOrganization(
      organizationId,
    ),
  ]);

  const items =
    memberships.map(
      toMembershipListItem,
    );

  return createPaginatedData(
    items,
    pagination,
    totalItems,
  );
}

//************************************************************** */

export async function getMembershipById(
  organizationId: string,
  membershipId: string,
): Promise<MembershipRecord> {
  const membership =
    await findMembershipById(
      organizationId,
      membershipId,
    );

  if (!membership) {
    throw new AppError(
      404,
      "Membership not found.",
      {
        code:
          "MEMBERSHIP_NOT_FOUND",
      },
    );
  }

  return toMembershipRecord(
    membership,
  );
}

//************************************************************** */

export async function createMembership(
  organizationId: string,
  actor: MembershipActorContext,
  email: string,
  role: MembershipRole,
): Promise<MembershipRecord> {
  assertMembershipCreateAllowed(
    actor,
    organizationId,
    role,
  );

  const user =
    await findUserForMembershipByEmail(
      email,
    );

  if (!user) {
    throw new AppError(
      404,
      "User not found.",
      {
        code:
          "USER_NOT_FOUND",
      },
    );
  }

  const existingMembership =
    await findMembershipByUserAndOrganization(
      user.id,
      organizationId,
    );

  if (existingMembership) {
    throw new AppError(
      409,
      "User is already a member of this organization.",
      {
        code:
          "MEMBERSHIP_ALREADY_EXISTS",
      },
    );
  }

  const permissions =
    getPermissionsForRole(
      role,
    );

  const membership =
    await createMembershipWithPermissions(
      organizationId,
      user.id,
      role,
      permissions,
      actor.membershipId,
    );

  return toMembershipRecord(
    membership,
  );
}

//************************************************************** */

export async function updateMembership(
  organizationId: string,
  membershipId: string,
  actor: MembershipActorContext,
  data: MembershipUpdateData,
): Promise<MembershipRecord> {
  const existing =
    await findMembershipForUpdate(
      organizationId,
      membershipId,
    );

  if (!existing) {
    throw new AppError(
      404,
      "Membership not found.",
      {
        code:
          "MEMBERSHIP_NOT_FOUND",
      },
    );
  }

  const {
    roleChanged,
    statusChanged,
  } =
    assertMembershipUpdateAllowed(
      actor,
      existing,
      organizationId,
      data,
    );

  const updateData: MembershipUpdateData = {
    ...(roleChanged &&
    data.role !== undefined
      ? {
          role:
            data.role,
        }
      : {}),

    ...(statusChanged &&
    data.status !== undefined
      ? {
          status:
            data.status,
        }
      : {}),
  };

  if (
    roleChanged &&
    data.role !== undefined
  ) {
    const permissions =
      getPermissionsForRole(
        data.role,
      );

    const membership =
      await updateMembershipRoleAndPermissions(
        organizationId,
        membershipId,
        updateData,
        permissions,
        actor.membershipId,
      );

    return toMembershipRecord(
      membership,
    );
  }

  const membership =
    await updateMembershipRecord(
      membershipId,
      updateData,
    );

  return toMembershipRecord(
    membership,
  );
}

//************************************************************** */




// import { AppError } from "../../platform/errors/app-error.js";

// import {
//   MembershipRole,
// } from "../../generated/prisma/client.js";

// import {
//   findUserIdByEmail,
// } from "../auth/shared/repositories/user-auth.repository.js";

// import {
//   assertMembershipUpdateAllowed,
// } from "./membership.policy.js";

// import {
//   countMembershipsByOrganization,
//   createMembershipWithPermissions,
//   findMembershipById,
//   findMembershipByUserAndOrganization,
//   findMembershipForUpdate,
//   findMembershipsByOrganization,
//   updateMembershipRecord,
//   updateMembershipRoleAndPermissions,
// } from "./membership.repository.js";

// import type {
//   MembershipActorContext,
//   MembershipListItem,
//   MembershipRecord,
//   MembershipUpdateData,
// } from "./membership.types.js";

// import {
//   toMembershipListItem,
//   toMembershipRecord,
// } from "./membership.utils.js";

// import {
//   createPaginatedData,
//   type PaginatedData,
//   type PaginationInput,
// } from "../../platform/http/pagination.js";

// import {
//   getPermissionsForRole,
// } from "../permissions/permission.utils.js";

// //************************************************************** */

// export async function listMemberships(
//   organizationId: string,
//   pagination: PaginationInput,
// ): Promise<PaginatedData<MembershipListItem>> {
//   const [
//     memberships,
//     totalItems,
//   ] = await Promise.all([
//     findMembershipsByOrganization(
//       organizationId,
//       pagination,
//     ),

//     countMembershipsByOrganization(
//       organizationId,
//     ),
//   ]);

//   const items =
//     memberships.map(
//       toMembershipListItem,
//     );

//   return createPaginatedData(
//     items,
//     pagination,
//     totalItems,
//   );
// }

// //************************************************************** */

// export async function getMembershipById(
//   organizationId: string,
//   membershipId: string,
// ): Promise<MembershipRecord> {
//   const membership =
//     await findMembershipById(
//       organizationId,
//       membershipId,
//     );

//   if (!membership) {
//     throw new AppError(
//       404,
//       "Membership not found.",
//       {
//         code:
//           "MEMBERSHIP_NOT_FOUND",
//       },
//     );
//   }

//   return toMembershipRecord(
//     membership,
//   );
// }

// //************************************************************** */

// export async function createMembership(
//   organizationId: string,
//   actor: MembershipActorContext,
//   email: string,
//   role: MembershipRole,
// ): Promise<MembershipRecord> {
//   if (
//     actor.organizationId !==
//     organizationId
//   ) {
//     throw new AppError(
//       403,
//       "You cannot create memberships for another organization.",
//       {
//         code:
//           "CROSS_ORGANIZATION_ACCESS_FORBIDDEN",
//       },
//     );
//   }

//   if (
//     actor.role !==
//     MembershipRole.OWNER
//   ) {
//     throw new AppError(
//       403,
//       "Only the organization owner can create memberships.",
//       {
//         code:
//           "MEMBERSHIP_CREATE_FORBIDDEN",
//       },
//     );
//   }

//   if (
//     role ===
//     MembershipRole.OWNER
//   ) {
//     throw new AppError(
//       400,
//       "Owner memberships cannot be created directly.",
//       {
//         code:
//           "OWNER_MEMBERSHIP_CREATE_FORBIDDEN",
//       },
//     );
//   }

// const user =
//   await findUserIdByEmail(
//     email,
//   );

// if (!user) {
//   throw new AppError(
//     404,
//     "User not found.",
//     {
//       code:
//         "USER_NOT_FOUND",
//     },
//   );
// }

// const existingMembership =
//   await findMembershipByUserAndOrganization(
//     user.id,
//     organizationId,
//   );

//   if (existingMembership) {
//     throw new AppError(
//       409,
//       "User is already a member of this organization.",
//       {
//         code:
//           "MEMBERSHIP_ALREADY_EXISTS",
//       },
//     );
//   }

//   const permissions =
//     getPermissionsForRole(
//       role,
//     );

// const membership =
//   await createMembershipWithPermissions(
//     organizationId,
//     user.id,
//     role,
//     permissions,
//     actor.membershipId,
//   );

//   return toMembershipRecord(
//     membership,
//   );
// }

// //************************************************************** */

// export async function updateMembership(
//   organizationId: string,
//   membershipId: string,
//   actor: MembershipActorContext,
//   data: MembershipUpdateData,
// ): Promise<MembershipRecord> {
//   const existing =
//     await findMembershipForUpdate(
//       organizationId,
//       membershipId,
//     );

//   if (!existing) {
//     throw new AppError(
//       404,
//       "Membership not found.",
//       {
//         code:
//           "MEMBERSHIP_NOT_FOUND",
//       },
//     );
//   }

//   const {
//     roleChanged,
//     statusChanged,
//   } =
//     assertMembershipUpdateAllowed(
//       actor,
//       existing,
//       organizationId,
//       data,
//     );

//   const updateData: MembershipUpdateData = {
//     ...(roleChanged &&
//     data.role !== undefined
//       ? {
//           role:
//             data.role,
//         }
//       : {}),

//     ...(statusChanged &&
//     data.status !== undefined
//       ? {
//           status:
//             data.status,
//         }
//       : {}),
//   };

//   if (
//     roleChanged &&
//     data.role !== undefined
//   ) {
//     const permissions =
//       getPermissionsForRole(
//         data.role,
//       );

//     const membership =
//       await updateMembershipRoleAndPermissions(
//         organizationId,
//         membershipId,
//         updateData,
//         permissions,
//         actor.membershipId,
//       );

//     return toMembershipRecord(
//       membership,
//     );
//   }

//   const membership =
//     await updateMembershipRecord(
//       membershipId,
//       updateData,
//     );

//   return toMembershipRecord(
//     membership,
//   );
// }

// //************************************************************** */