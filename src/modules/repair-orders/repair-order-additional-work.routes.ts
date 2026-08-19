import { Router } from "express";

import { z } from "zod";

import { authenticateRequest } from "../auth/index.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import {
  validateBody,
  validateParams,
} from "../../platform/validation/index.js";

import { sendAdditionalWorkToPartsReviewHandler } from "./repair-order-additional-work.controller.js";

import { sendAdditionalWorkToPartsReviewSchema } from "./repair-order-additional-work.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

const repairOrderAdditionalWorkParamsSchema = z.object({
  repairOrderId: z.string().min(1),
});

//************************************************************** */
// Send Additional Work To Parts Review

router.post(
  "/:repairOrderId/additional-work/parts-review",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderAdditionalWorkParamsSchema),
  validateBody(sendAdditionalWorkToPartsReviewSchema),
  sendAdditionalWorkToPartsReviewHandler,
);

//************************************************************** */

export default router;
