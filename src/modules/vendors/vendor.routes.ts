import { Router } from "express";

import { authenticateRequest } from "../auth/index.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../platform/validation/index.js";

import {
  archiveVendorHandler,
  createVendorHandler,
  getVendorHandler,
  listVendorsHandler,
  restoreVendorHandler,
  updateVendorHandler,
} from "./vendor.controller.js";

import {
  createVendorSchema,
  listVendorsQuerySchema,
  updateVendorSchema,
  vendorIdSchema,
} from "./vendor.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

router.post(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateBody(createVendorSchema),
  createVendorHandler,
);

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateQuery(listVendorsQuerySchema),
  listVendorsHandler,
);

//************************************************************** */

router.get(
  "/:vendorId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(vendorIdSchema),
  getVendorHandler,
);

//************************************************************** */

router.patch(
  "/:vendorId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(vendorIdSchema),
  validateBody(updateVendorSchema),
  updateVendorHandler,
);

//************************************************************** */

router.post(
  "/:vendorId/archive",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(vendorIdSchema),
  archiveVendorHandler,
);

//************************************************************** */

router.post(
  "/:vendorId/restore",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(vendorIdSchema),
  restoreVendorHandler,
);

//************************************************************** */

export default router;
