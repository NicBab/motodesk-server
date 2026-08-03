import { Router } from "express";

import { validateBody } from "../../platform/validation/validate-body.js";
import { validateParams } from "../../platform/validation/validate-params.js";
import { authenticateRequest } from "../auth/auth.middleware.js";
import { requireOrganizationAccess } from "../organizations/organization.middleware.js";
import { Permissions } from "../permissions/permission.constants.js";
import { requirePermissions } from "../permissions/permission.middleware.js";
import { initializeRequestContext } from "../../platform/request/request.middleware.js";
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
  initializeRequestContext,
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
  initializeRequestContext,
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
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(
    Permissions.MEMBERSHIPS_UPDATE,
  ),
  validateParams(membershipIdSchema),
  validateBody(updateMembershipSchema),
  updateMembershipHandler,
);

//************************************************************** */

export default router;