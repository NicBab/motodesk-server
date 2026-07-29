import { Router } from "express";
import { validateRequest } from "../../middleware/validate-request.js";
import { authenticateRequest } from "../auth/auth.middleware.js";
import { Permissions } from "../permissions/permission.constants.js";
import { requirePermissions } from "../permissions/permission.middleware.js";
import { requireOrganizationAccess } from "./organization.middleware.js";
import membershipRouter from "../memberships/membership.routes.js";
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
  validateRequest(createOrganizationSchema),
  createOrganizationHandler,
);

//************************************************************** */

router.get(
  "/me",
  authenticateRequest,
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
  requireOrganizationAccess,
  getOrganizationHandler,
);

//************************************************************** */

router.patch(
  "/:organizationId",
  authenticateRequest,
  requireOrganizationAccess,
  requirePermissions(
    Permissions.ORGANIZATION_UPDATE,
  ),
  validateRequest(updateOrganizationSchema),
  updateOrganizationHandler,
);

export default router;

//************************************************************** */