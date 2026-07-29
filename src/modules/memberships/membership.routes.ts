import { Router } from "express";

import { MembershipRole } from "../../generated/prisma/client.js";
import { validateRequest } from "../../middleware/validate-request.js";
import { validateParams } from "../../middleware/validate-params.js";
import { authenticateRequest } from "../auth/auth.middleware.js";
import { requireRoles } from "../auth/role.middleware.js";
import { requireOrganizationAccess } from "../organizations/organization.middleware.js";

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
  requireRoles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MANAGER,
  ),
  listMembershipsHandler,
);

//************************************************************** */

router.get(
  "/:membershipId",
  authenticateRequest,
  requireOrganizationAccess,
  requireRoles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.MANAGER,
  ),
  validateParams(membershipIdSchema),
  getMembershipHandler,
);

//************************************************************** */

router.patch(
  "/:membershipId",
  authenticateRequest,
  requireOrganizationAccess,
  requireRoles(
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
  ),
  validateParams(membershipIdSchema),
  validateRequest(updateMembershipSchema),
  updateMembershipHandler,
);

//************************************************************** */

export default router;