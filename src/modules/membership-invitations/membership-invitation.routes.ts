import { Router } from "express";

import { authenticateRequest } from "../auth/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { requirePermissions } from "../permissions/permission.middleware.js";

import { Permissions } from "../permissions/permission.constants.js";

import {
  validateBody,
  validateParams,
} from "../../platform/validation/index.js";

import {
  createMembershipInvitationSchema,
  membershipInvitationIdSchema,
} from "./membership-invitation.schemas.js";

import {
  createMembershipInvitationHandler,
  revokeMembershipInvitationHandler,
} from "./membership-invitation.controller.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

router.post(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.MEMBERSHIPS_INVITE),
  validateBody(createMembershipInvitationSchema),
  createMembershipInvitationHandler,
);

//************************************************************** */

router.delete(
  "/:invitationId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.MEMBERSHIPS_INVITE),
  validateParams(membershipInvitationIdSchema),
  revokeMembershipInvitationHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
