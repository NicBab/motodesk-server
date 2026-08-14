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
  createRepairOrderSchema,
  listRepairOrdersQuerySchema,
  repairOrderIdSchema,
  updateRepairOrderSchema,
  updateRepairOrderStatusSchema,
} from "./repair-order.schemas.js";

import {
  createRepairOrderHandler,
  getRepairOrderHandler,
  listRepairOrdersHandler,
  updateRepairOrderHandler,
  updateRepairOrderStatusHandler,
} from "./repair-order.controller.js";

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
  validateBody(createRepairOrderSchema),
  createRepairOrderHandler,
);

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateQuery(listRepairOrdersQuerySchema),
  listRepairOrdersHandler,
);

//************************************************************** */

router.get(
  "/:repairOrderId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderIdSchema),
  getRepairOrderHandler,
);

//************************************************************** */

router.patch(
  "/:repairOrderId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderIdSchema),
  validateBody(updateRepairOrderSchema),
  updateRepairOrderHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/status",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderIdSchema),
  validateBody(updateRepairOrderStatusSchema),
  updateRepairOrderStatusHandler,
);

//************************************************************** */

export default router;