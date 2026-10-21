import { Router } from "express";

import {
  authenticateRequest,
} from "../auth/index.js";

import {
  initializeRequestContext,
} from "../../platform/request/request.middleware.js";

import {
  requireOrganizationAccess,
} from "../organizations/index.js";

import {
  requirePermissions,
} from "../permissions/permission.middleware.js";

import {
  Permissions,
} from "../permissions/permission.constants.js";

import {
  validateBody,
} from "../../platform/validation/validate-body.js";

import {
  preventSensitiveResponseCaching,
} from "../../middleware/sensitive-response-cache.js";

import {
  createBillingCheckoutSchema,
  createBillingPortalSchema,
} from "./billing.schemas.js";

import {
  createBillingCheckoutHandler,
  createBillingPortalHandler,
  getBillingOverviewHandler,
} from "./billing.controller.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

router.use(preventSensitiveResponseCaching);

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.BILLING_VIEW),
  getBillingOverviewHandler,
);

//************************************************************** */

router.post(
  "/checkout",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.BILLING_UPDATE),
  validateBody(createBillingCheckoutSchema),
  createBillingCheckoutHandler,
);

//************************************************************** */

router.post(
  "/portal",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.BILLING_UPDATE),
  validateBody(createBillingPortalSchema),
  createBillingPortalHandler,
);

//************************************************************** */

export default router;

//************************************************************** */