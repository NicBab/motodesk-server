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
  approveAdditionalWorkHandler,
  declineAdditionalWorkHandler,
  requestAdditionalWorkApprovalHandler,
} from "./repair-order-additional-approval.controller.js";

import {
  approveAdditionalWorkSchema,
  declineAdditionalWorkSchema,
  requestAdditionalWorkApprovalSchema,
} from "./repair-order-additional-approval.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

const repairOrderAdditionalApprovalParamsSchema = z.object({
  repairOrderId: z.string().min(1),
});

//************************************************************** */
// Request Additional Approval

router.post(
  "/:repairOrderId/additional-approval/request",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderAdditionalApprovalParamsSchema),
  validateBody(requestAdditionalWorkApprovalSchema),
  requestAdditionalWorkApprovalHandler,
);

//************************************************************** */
// Approve Additional Work

router.post(
  "/:repairOrderId/additional-approval/approve",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderAdditionalApprovalParamsSchema),
  validateBody(approveAdditionalWorkSchema),
  approveAdditionalWorkHandler,
);

//************************************************************** */
// Decline Additional Work

router.post(
  "/:repairOrderId/additional-approval/decline",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(repairOrderAdditionalApprovalParamsSchema),
  validateBody(declineAdditionalWorkSchema),
  declineAdditionalWorkHandler,
);

//************************************************************** */

export default router;
