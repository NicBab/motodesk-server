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
  createEmployeeHandler,
  deactivateEmployeeHandler,
  getEmployeeHandler,
  listEmployeesHandler,
  restoreEmployeeHandler,
  updateEmployeeHandler,
} from "./employee.controller.js";

import {
  createEmployeeSchema,
  employeeIdSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from "./employee.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

router.post(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateBody(createEmployeeSchema),
  createEmployeeHandler,
);

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateQuery(listEmployeesQuerySchema),
  listEmployeesHandler,
);

//************************************************************** */

router.get(
  "/:employeeId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(employeeIdSchema),
  getEmployeeHandler,
);

//************************************************************** */

router.patch(
  "/:employeeId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(employeeIdSchema),
  validateBody(updateEmployeeSchema),
  updateEmployeeHandler,
);

//************************************************************** */

router.post(
  "/:employeeId/deactivate",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(employeeIdSchema),
  deactivateEmployeeHandler,
);

//************************************************************** */

router.post(
  "/:employeeId/restore",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(employeeIdSchema),
  restoreEmployeeHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
