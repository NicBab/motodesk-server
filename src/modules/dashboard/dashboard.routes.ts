import {
  Router,
} from "express";

import {
  authenticateRequest,
} from "../auth/index.js";

import {
  requireOrganizationAccess,
} from "../organizations/index.js";

import {
  Permissions,
} from "../permissions/permission.constants.js";

import {
  requirePermissions,
} from "../permissions/permission.middleware.js";

import {
  initializeRequestContext,
} from "../../platform/request/request.middleware.js";

import {
  getDashboardOverviewHandler,
} from "./dashboard.controller.js";

//************************************************************** */

const router =
  Router({
    mergeParams: true,
  });

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(
    Permissions.REPORTS_VIEW,
  ),
  getDashboardOverviewHandler,
);

//************************************************************** */

export default router;

//************************************************************** */