import { Router } from "express";

import {
  validateQuery,
} from "../../platform/validation/index.js";

import {
  validateBody,
} from "../../platform/validation/validate-body.js";

import {
  preventSensitiveResponseCaching,
} from "../../middleware/sensitive-response-cache.js";

import {
  loginRateLimit,
  refreshRateLimit,
} from "../auth/auth-rate-limit.js";

import {
  loginSchema,
} from "../auth/authentication/login/index.js";

import {
  logoutSchema,
} from "../auth/authentication/logout/index.js";

import {
  authenticatePlatformRequest,
} from "./platform-auth.middleware.js";

import {
  loginPlatformAdminHandler,
  logoutPlatformAdminHandler,
  refreshPlatformSessionHandler,
} from "./platform-auth.controller.js";

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

import {
  platformAuditQuerySchema,
} from "./platform-audit.schemas.js";

import {
  listPlatformAuditLogsHandler,
} from "./platform-audit.controller.js";

//************************************************************** */

const router = Router();

router.use(preventSensitiveResponseCaching);

//************************************************************** */
// Authentication endpoints precede the protected platform routes.
// Logout remains available without a valid access token or grant.

router.post(
  "/auth/login",
  loginRateLimit,
  validateBody(loginSchema),
  loginPlatformAdminHandler,
);

router.post(
  "/auth/refresh",
  refreshRateLimit,
  refreshPlatformSessionHandler,
);

router.post(
  "/auth/logout",
  validateBody(logoutSchema),
  logoutPlatformAdminHandler,
);

//************************************************************** */

router.use(
  authenticatePlatformRequest,
  requirePlatformAdmin(),
);

//************************************************************** */

router.get(
  "/me",
  getPlatformSessionHandler,
);

router.get(
  "/overview",
  validateQuery(platformOverviewQuerySchema),
  getPlatformOverviewHandler,
);

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

router.get(
  "/organizations/:organizationId/memberships",
  validateQuery(platformMembershipsQuerySchema),
  listPlatformOrganizationMembershipsHandler,
);

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

router.get(
  "/users/:userId/memberships",
  validateQuery(platformMembershipsQuerySchema),
  listPlatformUserMembershipsHandler,
);

router.get(
  "/users/:userId",
  getPlatformUserHandler,
);

//************************************************************** */

router.get(
  "/audit",
  validateQuery(platformAuditQuerySchema),
  listPlatformAuditLogsHandler,
);

//************************************************************** */

export default router;

//************************************************************** */