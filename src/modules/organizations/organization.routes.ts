import { Router } from "express";
import { validateRequest } from "../../middleware/validate-request.js";
import { MembershipRole } from "../../generated/prisma/client.js";
import { authenticateRequest } from "../auth/auth.middleware.js";
import { requireRoles } from "../auth/role.middleware.js";
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
  requireRoles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
  ),
  validateRequest(updateOrganizationSchema),
  updateOrganizationHandler,
);

export default router;

//************************************************************** */