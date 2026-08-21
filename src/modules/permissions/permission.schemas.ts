import { z } from "zod";

import {
  Permissions,
} from "./permission.constants.js";

import type {
  Permission,
} from "./permission.constants.js";

//************************************************************** */

const permissionValues =
  Object.values(Permissions) as [
    Permission,
    ...Permission[],
  ];

//************************************************************** */

export const updateMembershipPermissionsSchema =
  z.object({
    permissions: z.array(
      z.enum(permissionValues),
    ),
  });

//************************************************************** */

export type UpdateMembershipPermissionsInput =
  z.infer<
    typeof updateMembershipPermissionsSchema
  >;

//************************************************************** */