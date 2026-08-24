import { Router } from "express";

import { authenticateRequest } from "../auth/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { requirePermissions } from "../permissions/permission.middleware.js";

import { Permissions } from "../permissions/permission.constants.js";

import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../platform/validation/index.js";

import {
  createMembershipSchema,
  listMembershipsQuerySchema,
  membershipIdSchema,
  updateMembershipSchema,
} from "./membership.schemas.js";

import {
  createMembershipHandler,
  getMembershipHandler,
  listMembershipsHandler,
  removeMembershipHandler,
  updateMembershipHandler,
} from "./membership.controller.js";

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
  requirePermissions(Permissions.MEMBERSHIPS_VIEW),
  validateQuery(listMembershipsQuerySchema),
  listMembershipsHandler,
);

//************************************************************** */

router.post(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.MEMBERSHIPS_CREATE),
  validateBody(createMembershipSchema),
  createMembershipHandler,
);

//************************************************************** */

router.get(
  "/:membershipId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.MEMBERSHIPS_VIEW),
  validateParams(membershipIdSchema),
  getMembershipHandler,
);

//************************************************************** */

router.patch(
  "/:membershipId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.MEMBERSHIPS_UPDATE),
  validateParams(membershipIdSchema),
  validateBody(updateMembershipSchema),
  updateMembershipHandler,
);

//************************************************************** */

router.delete(
  "/:membershipId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.MEMBERSHIPS_DELETE),
  validateParams(membershipIdSchema),
  removeMembershipHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
