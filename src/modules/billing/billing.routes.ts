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
  createBillingUserCapacityPreviewSchema,
  confirmBillingUserCapacityChangeSchema,
} from "./billing.schemas.js";

import {
  createBillingPlanChangePreviewSchema,
  confirmBillingPlanChangeSchema,
} from "./billing-plan-change.schemas.js";

import {
  createBillingCheckoutHandler,
  createBillingPortalHandler,
  getBillingOverviewHandler,
  previewBillingUserCapacityHandler,
  confirmBillingUserCapacityHandler,
  previewBillingPlanChangeHandler,
  confirmBillingPlanChangeHandler,
} from "./billing.controller.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

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

router.post(
  "/user-capacity/preview",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.BILLING_UPDATE),
  validateBody(createBillingUserCapacityPreviewSchema),
  previewBillingUserCapacityHandler,
);

//************************************************************** */

router.post(
  "/user-capacity/confirm",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.BILLING_UPDATE),
  validateBody(confirmBillingUserCapacityChangeSchema),
  confirmBillingUserCapacityHandler,
);

//************************************************************** */

router.post(
  "/plan-change/preview",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.BILLING_UPDATE),
  validateBody(createBillingPlanChangePreviewSchema),
  previewBillingPlanChangeHandler,
);

//************************************************************** */

router.post(
  "/plan-change/confirm",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.BILLING_UPDATE),
  validateBody(confirmBillingPlanChangeSchema),
  confirmBillingPlanChangeHandler,
);

//************************************************************** */

export default router;

//************************************************************** */