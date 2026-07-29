import { Router } from "express";

import { validateParams } from "../../middleware/validate-params.js";
import { validateRequest } from "../../middleware/validate-request.js";
import { authenticateRequest } from "../auth/auth.middleware.js";
import { requireOrganizationAccess } from "../organizations/organization.middleware.js";
import { Permissions } from "../permissions/permission.constants.js";
import { requirePermissions } from "../permissions/permission.middleware.js";
import {
  getMembershipHandler,
  listMembershipsHandler,
  updateMembershipHandler,
} from "./membership.controller.js";
import {
  membershipIdSchema,
  updateMembershipSchema,
} from "./membership.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  requireOrganizationAccess,
  requirePermissions(
    Permissions.MEMBERSHIPS_VIEW,
  ),
  listMembershipsHandler,
);

//************************************************************** */

router.get(
  "/:membershipId",
  authenticateRequest,
  requireOrganizationAccess,
  requirePermissions(
    Permissions.MEMBERSHIPS_VIEW,
  ),
  validateParams(membershipIdSchema),
  getMembershipHandler,
);

//************************************************************** */

router.patch(
  "/:membershipId",
  authenticateRequest,
  requireOrganizationAccess,
  requirePermissions(
    Permissions.MEMBERSHIPS_UPDATE,
  ),
  validateParams(membershipIdSchema),
  validateRequest(updateMembershipSchema),
  updateMembershipHandler,
);

//************************************************************** */

export default router;