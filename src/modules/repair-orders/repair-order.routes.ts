
import { Router } from "express";

import { authenticateRequest } from "../auth/index.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import { requireLocationAccess } from "../locations/location-access.middleware.js";

import { requireRepairOrderLocationAccess } from "./repair-order-location-access.middleware.js";

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
  cashierRepairOrderSchema,
  closeRepairOrderSchema,
  pickupRepairOrderSchema,
  approveRepairOrderSchema,
  declineRepairOrderApprovalSchema,
  requestRepairOrderApprovalSchema,
  completeRepairOrderPartsReviewSchema,
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
  cashierRepairOrderHandler,
  closeRepairOrderHandler,
  pickupRepairOrderHandler,
  approveRepairOrderHandler,
  declineRepairOrderApprovalHandler,
  requestRepairOrderApprovalHandler,
  completeRepairOrderPartsReviewHandler,
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
  requireLocationAccess,
  validateBody(createRepairOrderSchema),
  createRepairOrderHandler,
);

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateQuery(listRepairOrdersQuerySchema),
  listRepairOrdersHandler,
);

//************************************************************** */

router.get(
  "/:repairOrderId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  getRepairOrderHandler,
);

//************************************************************** */

router.patch(
  "/:repairOrderId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(updateRepairOrderSchema),
  updateRepairOrderHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/quality-check/begin",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(beginRepairOrderQualityCheckSchema),
  beginRepairOrderQualityCheckHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/quality-check/pass",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(passRepairOrderQualityCheckSchema),
  passRepairOrderQualityCheckHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/quality-check/fail",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(failRepairOrderQualityCheckSchema),
  failRepairOrderQualityCheckHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/cashier",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(cashierRepairOrderSchema),
  cashierRepairOrderHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/pickup",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(pickupRepairOrderSchema),
  pickupRepairOrderHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/close",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(closeRepairOrderSchema),
  closeRepairOrderHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/approval/request",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(requestRepairOrderApprovalSchema),
  requestRepairOrderApprovalHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/approval/approve",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(approveRepairOrderSchema),
  approveRepairOrderHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/approval/decline",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(declineRepairOrderApprovalSchema),
  declineRepairOrderApprovalHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/parts-review/complete",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(completeRepairOrderPartsReviewSchema),
  completeRepairOrderPartsReviewHandler,
);

//************************************************************** */

router.post(
  "/:repairOrderId/status",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  validateParams(repairOrderIdSchema),
  requireRepairOrderLocationAccess,
  validateBody(updateRepairOrderStatusSchema),
  updateRepairOrderStatusHandler,
);

//************************************************************** */

router.use(
  "/:repairOrderId/labor-lines",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  requireRepairOrderLocationAccess,
  repairOrderLaborRouter,
);

//************************************************************** */

router.use(
  "/:repairOrderId/part-lines",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requireLocationAccess,
  requireRepairOrderLocationAccess,
  repairOrderPartRouter,
);

//************************************************************** */

export default router;
