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
  assignRepairOrderToServiceBayHandler,
  createServiceBayHandler,
  listServiceBaysHandler,
  releaseRepairOrderFromServiceBayHandler,
  updateServiceBayStatusHandler,
} from "./service-bay.controller.js";

import {
  assignRepairOrderToServiceBaySchema,
  createServiceBaySchema,
  releaseRepairOrderFromServiceBaySchema,
  updateServiceBayStatusSchema,
} from "./service-bay.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

const serviceBayAssignmentParamsSchema = z.object({
  repairOrderId: z.string().min(1),
});

//************************************************************** */

const serviceBayStatusParamsSchema = z.object({
  serviceBayId: z.string().min(1),
});

//************************************************************** */
// Create Service Bay

router.post(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateBody(createServiceBaySchema),
  createServiceBayHandler,
);

//************************************************************** */
// List Service Bays

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  listServiceBaysHandler,
);

//************************************************************** */
// Assign Repair Order To Service Bay

router.post(
  "/repair-orders/:repairOrderId/assign",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(serviceBayAssignmentParamsSchema),
  validateBody(assignRepairOrderToServiceBaySchema),
  assignRepairOrderToServiceBayHandler,
);

//************************************************************** */
// Release Repair Order From Service Bay

router.post(
  "/repair-orders/:repairOrderId/release",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(serviceBayAssignmentParamsSchema),
  validateBody(releaseRepairOrderFromServiceBaySchema),
  releaseRepairOrderFromServiceBayHandler,
);

//************************************************************** */
// Update Service Bay Status

router.post(
  "/:serviceBayId/status",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(serviceBayStatusParamsSchema),
  validateBody(updateServiceBayStatusSchema),
  updateServiceBayStatusHandler,
);

//************************************************************** */

export default router;
