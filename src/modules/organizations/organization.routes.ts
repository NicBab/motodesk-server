
import { Router } from "express";
import { validateBody } from "../../platform/validation/validate-body.js";

import { Permissions } from "../permissions/permission.constants.js";
import { requirePermissions } from "../permissions/permission.middleware.js";
import { requireOrganizationAccess } from "./organization.middleware.js";
import membershipRouter from "../memberships/membership.routes.js";
import permissionRouter from "../permissions/permission.routes.js";
import customerRouter from "../customers/customer.routes.js";
import { initializeRequestContext } from "../../platform/request/request.middleware.js";
import { validateParams } from "../../platform/validation/validate-params.js";
import repairOrderRouter from "../repair-orders/repair-order.routes.js";
import vehicleRouter from "../vehicles/vehicle.routes.js";
import partRouter from "../parts/part.routes.js";
import vendorRouter from "../vendors/vendor.routes.js";
import purchaseOrderRouter from "../purchase-orders/purchase-order.routes.js";
import scheduleRouter from "../scheduling/schedule.routes.js";
import technicianAssignmentRouter from "../technician-assignments/technician-assignment.routes.js";
import serviceBayRouter from "../service-bays/service-bay.routes.js";
import repairOrderWorkStatusRouter from "../repair-orders/repair-order-work-status.routes.js";
import repairOrderReopenRouter from "../repair-orders/repair-order-reopen.routes.js";
import repairOrderAdditionalWorkRouter from "../repair-orders/repair-order-additional-work.routes.js";
import repairOrderAdditionalApprovalRouter from "../repair-orders/repair-order-additional-approval.routes.js";
import repairOrderLaborCancelRouter from "../repair-orders/repair-order-labor-cancel.routes.js";
import repairOrderPartCancelRouter from "../repair-orders/repair-order-part-cancel.routes.js";
import membershipInvitationRouter from "../membership-invitations/membership-invitation.routes.js";
import auditRouter from "../audit/audit.routes.js";
import permissionCatalogRouter from "../permissions/permission-catalog.routes.js";
import { partReturnRouter } from "../part-returns/part-return.routes.js";
import saleRouter from "../sales/sale.routes.js";
import employeeRouter from "../employees/employee.routes.js";
import timeClockRouter from "../time-clock/time-clock.routes.js";
import serviceAppointmentRouter from "../service-appointments/service-appointment.routes.js";
import reportRouter from "../reports/report.routes.js";
import dashboardRouter from "../dashboard/dashboard.routes.js";
import billingRouter from "../billing/billing.routes.js";

import {
  requireSubscriptionAccess,
} from "../billing/billing-subscription-access.middleware.js";

import {
  createOrganizationSchema,
  updateOrganizationSchema,
  organizationIdSchema,
} from "./organization.schemas.js";

import {
  createOrganizationHandler,
  getMyOrganizationsHandler,
  getOrganizationHandler,
  updateOrganizationHandler,
  archiveOrganizationHandler,
  transferOrganizationOwnershipHandler,
} from "./organization.controller.js";

import { transferOrganizationOwnershipSchema } from "./organization-ownership.schemas.js";

import {
  authenticateRequest,
  requireRecentAuthentication,
  requireVerifiedEmail,
} from "../auth/index.js";

import locationRouter from "../locations/location.routes.js";

//************************************************************** */

const router = Router();

// Organization creation remains available for onboarding.

router.post(
  "/",
  authenticateRequest,
  requireVerifiedEmail,
  initializeRequestContext,
  validateBody(createOrganizationSchema),
  createOrganizationHandler,
);

//************************************************************** */

// Organization selection remains available.

router.get(
  "/me",
  authenticateRequest,
  initializeRequestContext,
  getMyOrganizationsHandler,
);

//************************************************************** */

// Ownership transfer is a business mutation and must
// also be protected by the subscription gate.

router.post(
  "/:organizationId/transfer-ownership",
  authenticateRequest,
  requireVerifiedEmail,
  initializeRequestContext,
  requireOrganizationAccess,
  requireSubscriptionAccess,
  requirePermissions(Permissions.ORGANIZATION_DELETE),
  requireRecentAuthentication,
  validateParams(organizationIdSchema),
  validateBody(transferOrganizationOwnershipSchema),
  transferOrganizationOwnershipHandler,
);

//************************************************************** */

// Shared authentication boundary for organization routes.

router.use(
  "/:organizationId",
  authenticateRequest,
  requireVerifiedEmail,
);

//************************************************************** */

// Billing must remain available for subscription recovery.
// The billing router retains its existing authorization
// and permission middleware.

router.use(
  "/:organizationId/billing",
  billingRouter,
);

//************************************************************** */

// Shared organization business access boundary.

router.use(
  "/:organizationId",
  initializeRequestContext,
  requireOrganizationAccess,
  requireSubscriptionAccess,
);

//************************************************************** */

router.use("/:organizationId/memberships", membershipRouter);

router.use("/:organizationId/memberships", permissionRouter);

router.use("/:organizationId/customers", customerRouter);

router.use("/:organizationId/vehicles", vehicleRouter);

router.use("/:organizationId/repair-orders", repairOrderRouter);

router.use("/:organizationId/parts", partRouter);

router.use("/:organizationId/vendors", vendorRouter);

router.use("/:organizationId/purchase-orders", purchaseOrderRouter);

router.use("/:organizationId/sales", saleRouter);

router.use("/:organizationId/scheduling", scheduleRouter);

router.use(
  "/:organizationId/scheduling/appointments",
  serviceAppointmentRouter,
);

router.use("/:organizationId/employees", employeeRouter);

router.use("/:organizationId/locations", locationRouter);

router.use("/:organizationId/time-clock", timeClockRouter);

router.use(
  "/:organizationId/technician-assignments",
  technicianAssignmentRouter,
);

router.use("/:organizationId/service-bays", serviceBayRouter);

router.use(
  "/:organizationId/repair-order-work-status",
  repairOrderWorkStatusRouter,
);

router.use("/:organizationId/repair-orders", repairOrderReopenRouter);

router.use("/:organizationId/repair-orders", repairOrderAdditionalWorkRouter);

router.use(
  "/:organizationId/repair-orders",
  repairOrderAdditionalApprovalRouter,
);

router.use("/:organizationId/repair-orders", repairOrderLaborCancelRouter);

router.use("/:organizationId/repair-orders", repairOrderPartCancelRouter);

router.use("/:organizationId/permission-catalog", permissionCatalogRouter);

router.use(
  "/:organizationId/membership-invitations",
  membershipInvitationRouter,
);

router.use("/:organizationId/audit", auditRouter);

router.use("/:organizationId/part-returns", partReturnRouter);

router.use("/:organizationId/reports", reportRouter);

router.use("/:organizationId/dashboard", dashboardRouter);

//************************************************************** */

router.get(
  "/:organizationId",
  validateParams(organizationIdSchema),
  getOrganizationHandler,
);

//************************************************************** */

router.patch(
  "/:organizationId",
  requirePermissions(Permissions.ORGANIZATION_UPDATE),
  validateParams(organizationIdSchema),
  validateBody(updateOrganizationSchema),
  updateOrganizationHandler,
);

//************************************************************** */

router.delete(
  "/:organizationId",
  requirePermissions(Permissions.ORGANIZATION_DELETE),
  requireRecentAuthentication,
  validateParams(organizationIdSchema),
  archiveOrganizationHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
