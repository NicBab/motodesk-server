
import { Router } from "express";
import { AppError } from "../../platform/errors/app-error.js";
import { getRequestContext } from "../../platform/request/request.context.js";
import { list } from "../../platform/http/api-response.js";
import { listAccessibleShopLocations } from "./location-access.service.js";

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
// List locations accessible to the current membership
//************************************************************** */

router.get(
  "/accessible",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  async (request, response, next) => {
    try {
      const organizationId = request.params.organizationId;
      const membership = getRequestContext().membership;

      if (typeof organizationId !== "string" || !organizationId.trim()) {
        throw new AppError(400, "A valid organization ID is required.", {
          code: "ORGANIZATION_ID_REQUIRED",
        });
      }

      if (!membership || membership.organizationId !== organizationId) {
        throw new AppError(403, "Organization membership is required.", {
          code: "ORGANIZATION_MEMBERSHIP_REQUIRED",
        });
      }

      const locations = await listAccessibleShopLocations(organizationId, {
        organizationId: membership.organizationId,
        membershipId: membership.id,
        role: membership.role,
      });

      list(response, locations);
    } catch (error) {
      next(error);
    }
  },
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
