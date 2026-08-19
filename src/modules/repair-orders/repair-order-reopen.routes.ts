import { Router } from "express";

import { z } from "zod";

import { authenticateRequest } from "../auth/index.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import {
  validateBody,
  validateParams,
} from "../../platform/validation/index.js";

import { reopenRepairOrderHandler } from "./repair-order-reopen.controller.js";

import { reopenRepairOrderSchema } from "./repair-order-reopen.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

const repairOrderReopenParamsSchema = z.object({
  repairOrderId: z.string().min(1),
});

//************************************************************** */
// Reopen

router.post(
  "/:repairOrderId/reopen",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderReopenParamsSchema),
  validateBody(reopenRepairOrderSchema),
  reopenRepairOrderHandler,
);

//************************************************************** */

export default router;
