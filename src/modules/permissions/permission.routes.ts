import { Router } from "express";

import { authenticateRequest } from "../auth/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import {
  validateBody,
  validateParams,
} from "../../platform/validation/index.js";

import { membershipIdSchema } from "../memberships/membership.schemas.js";

import { updateMembershipPermissionsSchema } from "./permission.schemas.js";

import {
  getMembershipPermissionsHandler,
  updateMembershipPermissionsHandler,
} from "./permission.controller.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

router.get(
  "/:membershipId/permissions",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(membershipIdSchema),
  getMembershipPermissionsHandler,
);

//************************************************************** */

router.put(
  "/:membershipId/permissions",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(membershipIdSchema),
  validateBody(updateMembershipPermissionsSchema),
  updateMembershipPermissionsHandler,
);

//************************************************************** */

export default router;
