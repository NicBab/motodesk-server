import { Router } from "express";

import {
  authenticateRequest,
} from "../auth/index.js";

import {
  validateQuery,
} from "../../platform/validation/index.js";

import {
  requirePlatformAdmin,
} from "./platform-admin.middleware.js";

import {
  platformGrowthQuerySchema,
  platformMembershipsQuerySchema,
  platformOrganizationsQuerySchema,
  platformOverviewQuerySchema,
  platformUsersQuerySchema,
} from "./platform-admin.schemas.js";

import {
  getPlatformGrowthHandler,
  getPlatformOrganizationHandler,
  getPlatformOverviewHandler,
  getPlatformSessionHandler,
  getPlatformUserHandler,
  listPlatformOrganizationMembershipsHandler,
  listPlatformOrganizationsHandler,
  listPlatformUserMembershipsHandler,
  listPlatformUsersHandler,
} from "./platform-admin.controller.js";

//************************************************************** */

const router = Router();

//************************************************************** */

// All routes require a valid session and a live platform-admin grant.
// Organization OWNER/ADMIN roles do not authorize these endpoints.
router.use(
  authenticateRequest,
  requirePlatformAdmin(),
);

//************************************************************** */

router.get(
  "/me",
  getPlatformSessionHandler,
);

//************************************************************** */

router.get(
  "/overview",
  validateQuery(platformOverviewQuerySchema),
  getPlatformOverviewHandler,
);

//************************************************************** */

router.get(
  "/growth",
  validateQuery(platformGrowthQuerySchema),
  getPlatformGrowthHandler,
);

//************************************************************** */

router.get(
  "/organizations",
  validateQuery(platformOrganizationsQuerySchema),
  listPlatformOrganizationsHandler,
);

//************************************************************** */

router.get(
  "/organizations/:organizationId/memberships",
  validateQuery(platformMembershipsQuerySchema),
  listPlatformOrganizationMembershipsHandler,
);

//************************************************************** */

router.get(
  "/organizations/:organizationId",
  getPlatformOrganizationHandler,
);

//************************************************************** */

router.get(
  "/users",
  validateQuery(platformUsersQuerySchema),
  listPlatformUsersHandler,
);

//************************************************************** */

router.get(
  "/users/:userId/memberships",
  validateQuery(platformMembershipsQuerySchema),
  listPlatformUserMembershipsHandler,
);

//************************************************************** */

router.get(
  "/users/:userId",
  getPlatformUserHandler,
);

//************************************************************** */

export default router;

//************************************************************** */