import { Router } from "express";
import { validateBody } from "../../platform/validation/validate-body.js";
import { authenticateRequest } from "../auth/auth.middleware.js";
import { Permissions } from "../permissions/permission.constants.js";
import { requirePermissions } from "../permissions/permission.middleware.js";
import { requireOrganizationAccess } from "./organization.middleware.js";
import membershipRouter from "../memberships/membership.routes.js";
import { initializeRequestContext } from "../../platform/request/request.middleware.js";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "./organization.schemas.js";
import {
  createOrganizationHandler,
  getMyOrganizationsHandler,
  getOrganizationHandler,
  updateOrganizationHandler,
} from "./organization.controller.js";

//************************************************************** */

const router = Router();

router.post(
  "/",
  authenticateRequest,
  initializeRequestContext,
  validateBody(createOrganizationSchema),
  createOrganizationHandler,
);

//************************************************************** */

router.get(
  "/me",
  authenticateRequest,
  initializeRequestContext,
  getMyOrganizationsHandler,
);

//************************************************************** */

router.use(
  "/:organizationId/memberships",
  membershipRouter,
);

//************************************************************** */

router.get(
  "/:organizationId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  getOrganizationHandler,
);

//************************************************************** */

router.patch(
  "/:organizationId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(
    Permissions.ORGANIZATION_UPDATE,
  ),
  validateBody(updateOrganizationSchema),
  updateOrganizationHandler,
);

export default router;

//************************************************************** */