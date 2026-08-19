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
  pauseRepairOrderWorkHandler,
  resumeRepairOrderWorkHandler,
} from "./repair-order-work-status.controller.js";

import {
  pauseRepairOrderWorkSchema,
  resumeRepairOrderWorkSchema,
} from "./repair-order-work-status.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

const repairOrderWorkStatusParamsSchema = z.object({
  repairOrderId: z.string().min(1),
});

//************************************************************** */
// Pause

router.post(
  "/repair-orders/:repairOrderId/pause",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderWorkStatusParamsSchema),
  validateBody(pauseRepairOrderWorkSchema),
  pauseRepairOrderWorkHandler,
);

//************************************************************** */
// Resume

router.post(
  "/repair-orders/:repairOrderId/resume",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderWorkStatusParamsSchema),
  validateBody(resumeRepairOrderWorkSchema),
  resumeRepairOrderWorkHandler,
);

//************************************************************** */

export default router;
