import { Router } from "express";
import { z } from "zod";

import { authenticateRequest } from "../auth/index.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import {
  validateBody,
  validateParams,
} from "../../platform/validation/index.js";

import {
  scheduleRepairOrderHandler,
  rescheduleRepairOrderHandler,
  cancelRepairOrderScheduleHandler,
} from "./schedule.controller.js";

import {
  scheduleRepairOrderSchema,
  rescheduleRepairOrderSchema,
  cancelScheduleSchema,
} from "./schedule.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

const scheduleRepairOrderParamsSchema = z.object({
  repairOrderId: z.string().min(1),
});

//************************************************************** */

router.post(
  "/repair-orders/:repairOrderId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(scheduleRepairOrderParamsSchema),
  validateBody(scheduleRepairOrderSchema),
  scheduleRepairOrderHandler,
);

//************************************************************** */

router.post(
  "/repair-orders/:repairOrderId/reschedule",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(scheduleRepairOrderParamsSchema),
  validateBody(rescheduleRepairOrderSchema),
  rescheduleRepairOrderHandler,
);

//************************************************************** */

router.post(
  "/repair-orders/:repairOrderId/cancel",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(scheduleRepairOrderParamsSchema),
  validateBody(cancelScheduleSchema),
  cancelRepairOrderScheduleHandler,
);

//************************************************************** */

export default router;
