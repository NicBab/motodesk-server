import { Router } from "express";
import { z } from "zod";

import { authenticateRequest } from "../auth/index.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import {
  validateBody,
  validateParams,
} from "../../platform/validation/index.js";

import { assignTechnicianHandler } from "./technician-assignment.controller.js";

import { assignTechnicianSchema } from "./technician-assignment.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

const technicianAssignmentParamsSchema = z.object({
  repairOrderId: z.string().min(1),
});

//************************************************************** */

router.post(
  "/repair-orders/:repairOrderId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(technicianAssignmentParamsSchema),
  validateBody(assignTechnicianSchema),
  assignTechnicianHandler,
);

//************************************************************** */

export default router;
