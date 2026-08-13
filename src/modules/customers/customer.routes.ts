import { Router } from "express";

import {
  authenticateRequest,
} from "../auth/index.js";

import {
  initializeRequestContext,
} from "../../platform/request/request.middleware.js";

import {
  requireOrganizationAccess,
} from "../organizations/index.js";

import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../platform/validation/index.js";

import {
  archiveCustomerHandler,
  createCustomerHandler,
  getCustomerHandler,
  listCustomersHandler,
  updateCustomerHandler,
} from "./customer.controller.js";

import {
  createCustomerSchema,
  customerIdSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "./customer.schemas.js";

//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateQuery(listCustomersQuerySchema),
  listCustomersHandler,
);

//************************************************************** */

router.get(
  "/:customerId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(customerIdSchema),
  getCustomerHandler,
);

//************************************************************** */

router.post(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateBody(createCustomerSchema),
  createCustomerHandler,
);

//************************************************************** */

router.patch(
  "/:customerId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(customerIdSchema),
  validateBody(updateCustomerSchema),
  updateCustomerHandler,
);

//************************************************************** */

router.post(
  "/:customerId/archive",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(customerIdSchema),
  archiveCustomerHandler,
);

export default router;