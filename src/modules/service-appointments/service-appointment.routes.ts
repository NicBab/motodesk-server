import { Router } from "express";

import { authenticateRequest } from "../auth/index.js";

import { requireOrganizationAccess } from "../organizations/index.js";

import { Permissions } from "../permissions/permission.constants.js";

import { requirePermissions } from "../permissions/permission.middleware.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../platform/validation/index.js";

import {
  cancelServiceAppointmentHandler,
  checkInServiceAppointmentHandler,
  confirmServiceAppointmentHandler,
  convertServiceAppointmentToRepairOrderHandler,
  createServiceAppointmentHandler,
  getServiceAppointmentHandler,
  listServiceAppointmentsHandler,
} from "./service-appointment.controller.js";

import {
  cancelServiceAppointmentSchema,
  createServiceAppointmentSchema,
  listServiceAppointmentsQuerySchema,
  serviceAppointmentIdSchema,
} from "./service-appointment.schemas.js";

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
  requirePermissions(Permissions.SCHEDULING_VIEW),
  validateQuery(listServiceAppointmentsQuerySchema),
  listServiceAppointmentsHandler,
);

//************************************************************** */

router.get(
  "/:appointmentId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.SCHEDULING_VIEW),
  validateParams(serviceAppointmentIdSchema),
  getServiceAppointmentHandler,
);

//************************************************************** */

router.post(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.SCHEDULING_CREATE),
  validateBody(createServiceAppointmentSchema),
  createServiceAppointmentHandler,
);

//************************************************************** */

router.post(
  "/:appointmentId/confirm",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.SCHEDULING_UPDATE),
  validateParams(serviceAppointmentIdSchema),
  confirmServiceAppointmentHandler,
);

//************************************************************** */

router.post(
  "/:appointmentId/check-in",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.SCHEDULING_UPDATE),
  validateParams(serviceAppointmentIdSchema),
  checkInServiceAppointmentHandler,
);

//************************************************************** */

router.post(
  "/:appointmentId/cancel",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.SCHEDULING_DELETE),
  validateParams(serviceAppointmentIdSchema),
  validateBody(cancelServiceAppointmentSchema),
  cancelServiceAppointmentHandler,
);

//************************************************************** */

router.post(
  "/:appointmentId/convert-to-repair-order",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(
    Permissions.SCHEDULING_UPDATE,
    Permissions.REPAIR_ORDERS_CREATE,
  ),
  validateParams(serviceAppointmentIdSchema),
  convertServiceAppointmentToRepairOrderHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
