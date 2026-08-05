import { Router } from "express";
import { authenticateRequest } from "../auth/index.js";
import { Permissions } from "../permissions/permission.constants.js";
import { requirePermissions } from "../permissions/permission.middleware.js";
import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import {
  requireOrganizationAccess,
} from "../organizations/organization.contracts.js";

import {
  getMembershipHandler,
  listMembershipsHandler,
  updateMembershipHandler,
} from "./membership.controller.js";

import {
  listMembershipsQuerySchema,
  membershipIdSchema,
  updateMembershipSchema,
} from "./membership.schemas.js";

import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../platform/validation/index.js";

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
  validateQuery(
    listMembershipsQuerySchema,
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