
import { Router } from "express";

import {
  authenticateRequest,
  requireRecentAuthentication,
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
  validateParams,
} from "../../platform/validation/index.js";

import {
  createShopLocationSchema,
  locationIdSchema,
  assignLocationEmployeesSchema,
} from "./location.schemas.js";

import {
  listLocationsHandler,
  getLocationHandler,
  listLocationEmployeesHandler,
  createLocationHandler,
  assignLocationEmployeesHandler,
} from "./location.controller.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */
// List organization locations
//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.ORGANIZATION_VIEW),
  listLocationsHandler,
);

//************************************************************** */
// List employees available for location assignment
//************************************************************** */

router.get(
  "/employees",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.MEMBERSHIPS_VIEW),
  listLocationEmployeesHandler,
);

//************************************************************** */
// Create location
//************************************************************** */

router.post(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.ORGANIZATION_UPDATE),
  requireRecentAuthentication,
  validateBody(createShopLocationSchema),
  createLocationHandler,
);

//************************************************************** */
// Retrieve location and assigned employees
//************************************************************** */

router.get(
  "/:locationId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.ORGANIZATION_VIEW),
  validateParams(locationIdSchema),
  getLocationHandler,
);

//************************************************************** */
// Replace employee assignments
//************************************************************** */

router.put(
  "/:locationId/employees",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.MEMBERSHIPS_UPDATE),
  requireRecentAuthentication,
  validateParams(locationIdSchema),
  validateBody(assignLocationEmployeesSchema),
  assignLocationEmployeesHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
