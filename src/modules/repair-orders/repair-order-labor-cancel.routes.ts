import { Router } from "express";

import { z } from "zod";

import { authenticateRequest } from "../auth/index.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import {
  validateBody,
  validateParams,
} from "../../platform/validation/index.js";

import { cancelRepairOrderLaborLineHandler } from "./repair-order-labor-cancel.controller.js";

import { cancelRepairOrderLaborLineSchema } from "./repair-order-labor-cancel.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

const repairOrderLaborCancelParamsSchema = z.object({
  repairOrderId: z.string().min(1),

  laborLineId: z.string().min(1),
});

//************************************************************** */
// Cancel Proposed Labor Line

router.post(
  "/:repairOrderId/labor-lines/:laborLineId/cancel",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderLaborCancelParamsSchema),
  validateBody(cancelRepairOrderLaborLineSchema),
  cancelRepairOrderLaborLineHandler,
);

//************************************************************** */

export default router;
