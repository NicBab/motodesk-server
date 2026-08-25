import { Router } from "express";

import { authenticateRequest } from "../auth/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { requirePermissions } from "../permissions/permission.middleware.js";

import { Permissions } from "../permissions/permission.constants.js";

import { validateQuery } from "../../platform/validation/index.js";

import { listAuditLogsQuerySchema } from "./audit.schemas.js";

import { listAuditLogsHandler } from "./audit.controller.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.AUDIT_VIEW),
  validateQuery(listAuditLogsQuerySchema),
  listAuditLogsHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
