import {
  MembershipRole,
} from "../../generated/prisma/client.js";

import type {
  Permission,
} from "./permission.constants.js";

import {
  rolePermissions,
} from "./permission.roles.js";

import type {
  PermissionCheckResult,
} from "./permission.types.js";

//************************************************************** */

export function getPermissionsForRole(
  role: MembershipRole,
): Permission[] {
  return Array.from(
    rolePermissions[role],
  );
}

//************************************************************** */

export function getEffectivePermissions(
  role: MembershipRole,
  membershipPermissions: readonly Permission[],
): Permission[] {
  if (
    role ===
    MembershipRole.OWNER
  ) {
    return getPermissionsForRole(
      MembershipRole.OWNER,
    );
  }

  return Array.from(
    membershipPermissions,
  );
}

//************************************************************** */

export function hasPermission(
  role: MembershipRole,
  permission: Permission,
): boolean {
  return rolePermissions[role].has(
    permission,
  );
}

//************************************************************** */

export function hasEffectivePermission(
  effectivePermissions: readonly Permission[],
  permission: Permission,
): boolean {
  return effectivePermissions.includes(
    permission,
  );
}

//************************************************************** */

export function checkPermissions(
  role: MembershipRole,
  requiredPermissions: readonly Permission[],
): PermissionCheckResult {
  const grantedPermissions =
    rolePermissions[role];

  const missingPermissions =
    requiredPermissions.filter(
      (permission) =>
        !grantedPermissions.has(permission),
    );

  return {
    allowed:
      missingPermissions.length === 0,
    missingPermissions,
  };
}

//************************************************************** */

export function checkEffectivePermissions(
  effectivePermissions: readonly Permission[],
  requiredPermissions: readonly Permission[],
): PermissionCheckResult {
  const grantedPermissions =
    new Set(effectivePermissions);

  const missingPermissions =
    requiredPermissions.filter(
      (permission) =>
        !grantedPermissions.has(permission),
    );

  return {
    allowed:
      missingPermissions.length === 0,
    missingPermissions,
  };
}

//************************************************************** */

export function hasAnyPermission(
  role: MembershipRole,
  permissions: readonly Permission[],
): boolean {
  return permissions.some(
    (permission) =>
      rolePermissions[role].has(permission),
  );
}

//************************************************************** */

export function hasAnyEffectivePermission(
  effectivePermissions: readonly Permission[],
  permissions: readonly Permission[],
): boolean {
  const grantedPermissions =
    new Set(effectivePermissions);

  return permissions.some(
    (permission) =>
      grantedPermissions.has(permission),
  );
}

//************************************************************** */










// import type {
//   MembershipRole,
// } from "../../generated/prisma/client.js";

// import type {
//   Permission,
// } from "./permission.constants.js";

// import {
//   rolePermissions,
// } from "./permission.roles.js";

// import type {
//   PermissionCheckResult,
// } from "./permission.types.js";

// //************************************************************** */

// export function getPermissionsForRole(
//   role: MembershipRole,
// ): Permission[] {
//   return Array.from(
//     rolePermissions[role],
//   );
// }

// //************************************************************** */

// export function hasPermission(
//   role: MembershipRole,
//   permission: Permission,
// ): boolean {
//   return rolePermissions[role].has(
//     permission,
//   );
// }

// //************************************************************** */

// export function checkPermissions(
//   role: MembershipRole,
//   requiredPermissions: readonly Permission[],
// ): PermissionCheckResult {
//   const grantedPermissions =
//     rolePermissions[role];

//   const missingPermissions =
//     requiredPermissions.filter(
//       (permission) =>
//         !grantedPermissions.has(permission),
//     );

//   return {
//     allowed:
//       missingPermissions.length === 0,
//     missingPermissions,
//   };
// }

// //************************************************************** */

// export function hasAnyPermission(
//   role: MembershipRole,
//   permissions: readonly Permission[],
// ): boolean {
//   return permissions.some(
//     (permission) =>
//       rolePermissions[role].has(permission),
//   );
// }