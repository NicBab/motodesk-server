import { Router } from "express";

import {
  authenticateRequest,
} from "../auth/index.js";

import {
  requireOrganizationAccess,
} from "../organizations/index.js";

import {
  initializeRequestContext,
} from "../../platform/request/request.middleware.js";

import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../platform/validation/index.js";

import {
  createVehicleSchema,
  listVehiclesQuerySchema,
  updateVehicleSchema,
  vehicleIdSchema,
} from "./vehicle.schemas.js";

import {
  archiveVehicleHandler,
  createVehicleHandler,
  getVehicleHandler,
  listVehiclesHandler,
  updateVehicleHandler,
  restoreVehicleHandler
} from "./vehicle.controller.js";

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
  validateBody(createVehicleSchema),
  createVehicleHandler,
);

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateQuery(listVehiclesQuerySchema),
  listVehiclesHandler,
);

//************************************************************** */

router.get(
  "/:vehicleId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(vehicleIdSchema),
  getVehicleHandler,
);

//************************************************************** */

router.patch(
  "/:vehicleId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(vehicleIdSchema),
  validateBody(updateVehicleSchema),
  updateVehicleHandler,
);

//************************************************************** */

router.post(
  "/:vehicleId/archive",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(vehicleIdSchema),
  archiveVehicleHandler,
);

//************************************************************** */

router.post(
  "/:vehicleId/restore",
  validateParams(vehicleIdSchema),
  restoreVehicleHandler,
);

//************************************************************** */

export default router;