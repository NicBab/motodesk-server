import { Router } from "express";

import { authenticateRequest } from "../auth/index.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { Permissions } from "../permissions/permission.constants.js";

import { requirePermissions } from "../permissions/permission.middleware.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import { validateQuery } from "../../platform/validation/index.js";

import { getReportOverviewHandler } from "./report.controller.js";

import { reportOverviewQuerySchema } from "./report.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

router.get(
  "/overview",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.REPORTS_VIEW),
  validateQuery(reportOverviewQuerySchema),
  getReportOverviewHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
