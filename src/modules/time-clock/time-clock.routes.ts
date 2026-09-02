import { Router } from "express";

import { authenticateRequest } from "../auth/index.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../platform/validation/index.js";

import {
  clockEmployeeInHandler,
  clockEmployeeOutHandler,
  correctTimeEntryHandler,
  createManualTimeEntryHandler,
  getCurrentlyClockedInHandler,
  getEmployeeTimeHistoryHandler,
  getTimeClockStatusHandler,
  getTimeClockReportHandler,
} from "./time-clock.controller.js";

import {
  correctTimeEntrySchema,
  createManualTimeEntrySchema,
  timeClockActionSchema,
  timeClockEmployeeParamsSchema,
  timeClockEntryParamsSchema,
  timeClockReportQuerySchema,
} from "./time-clock.schemas.js";

import { Permissions } from "../permissions/permission.constants.js";

import { requirePermissions } from "../permissions/permission.middleware.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

router.get(
  "/current",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  getCurrentlyClockedInHandler,
);

//************************************************************** */

router.get(
  "/report",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.TIME_CLOCK_MANAGE),
  validateQuery(timeClockReportQuerySchema),
  getTimeClockReportHandler,
);

//************************************************************** */

router.post(
  "/entries/manual",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateBody(createManualTimeEntrySchema),
  createManualTimeEntryHandler,
);

//************************************************************** */

router.patch(
  "/entries/:timeEntryId/correction",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(timeClockEntryParamsSchema),
  validateBody(correctTimeEntrySchema),
  correctTimeEntryHandler,
);

//************************************************************** */

router.get(
  "/employees/:employeeId/status",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(timeClockEmployeeParamsSchema),
  getTimeClockStatusHandler,
);

//************************************************************** */

router.get(
  "/employees/:employeeId/history",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(timeClockEmployeeParamsSchema),
  getEmployeeTimeHistoryHandler,
);

//************************************************************** */

router.post(
  "/employees/:employeeId/clock-in",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(timeClockEmployeeParamsSchema),
  validateBody(timeClockActionSchema),
  clockEmployeeInHandler,
);

//************************************************************** */

router.post(
  "/employees/:employeeId/clock-out",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(timeClockEmployeeParamsSchema),
  validateBody(timeClockActionSchema),
  clockEmployeeOutHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
