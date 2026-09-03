import { Router } from "express";

import { z } from "zod";

import { authenticateRequest } from "../auth/index.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { Permissions } from "../permissions/permission.constants.js";

import { requirePermissions } from "../permissions/permission.middleware.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../platform/validation/index.js";

import {
  cancelRepairOrderScheduleHandler,
  getScheduleBoardHandler,
  rescheduleRepairOrderHandler,
  scheduleRepairOrderHandler,
} from "./schedule.controller.js";

import {
  cancelScheduleSchema,
  rescheduleRepairOrderSchema,
  scheduleBoardQuerySchema,
  scheduleRepairOrderSchema,
} from "./schedule.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

const scheduleRepairOrderParamsSchema = z.object({
  repairOrderId: z.string().trim().min(1),
});

//************************************************************** */
// Dispatch Board

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.SCHEDULING_VIEW),
  validateQuery(scheduleBoardQuerySchema),
  getScheduleBoardHandler,
);

//************************************************************** */
// Schedule Repair Order

router.post(
  "/repair-orders/:repairOrderId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.SCHEDULING_CREATE),
  validateParams(scheduleRepairOrderParamsSchema),
  validateBody(scheduleRepairOrderSchema),
  scheduleRepairOrderHandler,
);

//************************************************************** */
// Reschedule Repair Order

router.post(
  "/repair-orders/:repairOrderId/reschedule",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.SCHEDULING_UPDATE),
  validateParams(scheduleRepairOrderParamsSchema),
  validateBody(rescheduleRepairOrderSchema),
  rescheduleRepairOrderHandler,
);

//************************************************************** */
// Cancel Repair Order Schedule

router.post(
  "/repair-orders/:repairOrderId/cancel",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.SCHEDULING_DELETE),
  validateParams(scheduleRepairOrderParamsSchema),
  validateBody(cancelScheduleSchema),
  cancelRepairOrderScheduleHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
