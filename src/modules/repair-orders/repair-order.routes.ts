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
  createRepairOrderSchema,
  listRepairOrdersQuerySchema,
  repairOrderIdSchema,
  updateRepairOrderSchema,
  updateRepairOrderStatusSchema,
  beginRepairOrderQualityCheckSchema,
  failRepairOrderQualityCheckSchema,
  passRepairOrderQualityCheckSchema,
} from "./repair-order.schemas.js";

import {
  createRepairOrderHandler,
  getRepairOrderHandler,
  listRepairOrdersHandler,
  updateRepairOrderHandler,
  updateRepairOrderStatusHandler,
  beginRepairOrderQualityCheckHandler,
  failRepairOrderQualityCheckHandler,
  passRepairOrderQualityCheckHandler,
} from "./repair-order.controller.js";

import repairOrderLaborRouter from "./repair-order-labor.routes.js";

import repairOrderPartRouter from "./repair-order-part.routes.js";

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
  "/:repairOrderId/quality-check/begin",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderIdSchema),
  validateBody(beginRepairOrderQualityCheckSchema),
  beginRepairOrderQualityCheckHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/quality-check/pass",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderIdSchema),
  validateBody(passRepairOrderQualityCheckSchema),
  passRepairOrderQualityCheckHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/quality-check/fail",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderIdSchema),
  validateBody(failRepairOrderQualityCheckSchema),
  failRepairOrderQualityCheckHandler,
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

router.use(
  "/:repairOrderId/labor-lines",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  repairOrderLaborRouter,
);

//************************************************************** */

router.use(
  "/:repairOrderId/part-lines",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  repairOrderPartRouter,
);

//************************************************************** */

export default router;
