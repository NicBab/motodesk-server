import type {
  MembershipRole,
} from "../../generated/prisma/client.js";
import type {
  Permission,
} from "./permission.constants.js";

//************************************************************** */

export type RolePermissionMap = Readonly<
  Record<
    MembershipRole,
    ReadonlySet<Permission>
  >
>;

//************************************************************** */

export type PermissionCheckContext = {
  role: MembershipRole;
  requiredPermissions: readonly Permission[];
};

//************************************************************** */

export type PermissionCheckResult = {
  allowed: boolean;
  missingPermissions: Permission[];
};

//************************************************************** */

export type AuthenticatedPermissionContext = {
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
  permissions: Permission[];
};