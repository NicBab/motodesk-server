import {
  Router,
} from "express";

import { z } from "zod";

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
} from "../../platform/validation/index.js";

import {
  cancelRepairOrderPartLineHandler,
} from "./repair-order-part-cancel.controller.js";

import {
  cancelRepairOrderPartLineSchema,
} from "./repair-order-part-cancel.schemas.js";

//************************************************************** */

const router =
  Router({
    mergeParams: true,
  });

//************************************************************** */

const repairOrderPartCancelParamsSchema =
  z.object({
    repairOrderId:
      z.string().min(1),

    partLineId:
      z.string().min(1),
  });

//************************************************************** */
// Cancel Proposed Part Line

router.post(
  "/:repairOrderId/part-lines/:partLineId/cancel",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(
    repairOrderPartCancelParamsSchema,
  ),
  validateBody(
    cancelRepairOrderPartLineSchema,
  ),
  cancelRepairOrderPartLineHandler,
);

//************************************************************** */

export default router;