import { Router } from "express";
import { validateBody } from "../../platform/validation/validate-body.js";
import { authenticateRequest } from "../auth/index.js";
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

//************************************************************** */

const router = Router();

router.post(
  "/",
  authenticateRequest,
  initializeRequestContext,
  validateBody(createOrganizationSchema),
  createOrganizationHandler,
);

//************************************************************** */

router.get(
  "/me",
  authenticateRequest,
  initializeRequestContext,
  getMyOrganizationsHandler,
);

//************************************************************** */

router.post(
  "/:organizationId/transfer-ownership",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.ORGANIZATION_DELETE),
  validateParams(organizationIdSchema),
  validateBody(transferOrganizationOwnershipSchema),
  transferOrganizationOwnershipHandler,
);

//************************************************************** */

router.use("/:organizationId/memberships", membershipRouter);

//************************************************************** */

router.use("/:organizationId/memberships", permissionRouter);

//************************************************************** */

router.use("/:organizationId/customers", customerRouter);

//************************************************************** */

router.use("/:organizationId/vehicles", vehicleRouter);

//************************************************************** */

router.use("/:organizationId/repair-orders", repairOrderRouter);

//************************************************************** */

router.use("/:organizationId/parts", partRouter);

//************************************************************** */

router.use("/:organizationId/vendors", vendorRouter);

//************************************************************** */

router.use("/:organizationId/purchase-orders", purchaseOrderRouter);

//************************************************************** */

router.use("/:organizationId/sales", saleRouter);

//************************************************************** */

router.use("/:organizationId/scheduling", scheduleRouter);

//************************************************************** */

router.use(
  "/:organizationId/technician-assignments",
  technicianAssignmentRouter,
);

//************************************************************** */

router.use("/:organizationId/service-bays", serviceBayRouter);

//************************************************************** */

router.use(
  "/:organizationId/repair-order-work-status",
  repairOrderWorkStatusRouter,
);

//************************************************************** */

router.use("/:organizationId/repair-orders", repairOrderReopenRouter);

//************************************************************** */

router.use("/:organizationId/repair-orders", repairOrderAdditionalWorkRouter);

//************************************************************** */

router.use(
  "/:organizationId/repair-orders",
  repairOrderAdditionalApprovalRouter,
);

//************************************************************** */

router.use("/:organizationId/repair-orders", repairOrderLaborCancelRouter);

//************************************************************** */

router.use("/:organizationId/repair-orders", repairOrderPartCancelRouter);

//************************************************************** */

router.use("/:organizationId/permission-catalog", permissionCatalogRouter);

//************************************************************** */

router.use(
  "/:organizationId/membership-invitations",
  membershipInvitationRouter,
);

//************************************************************** */

router.use("/:organizationId/audit", auditRouter);

//************************************************************** */

router.use(
  "/:organizationId/part-returns",
  partReturnRouter,
);

//************************************************************** */

router.get(
  "/:organizationId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(organizationIdSchema),
  getOrganizationHandler,
);

//************************************************************** */

router.patch(
  "/:organizationId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.ORGANIZATION_UPDATE),
  validateParams(organizationIdSchema),
  validateBody(updateOrganizationSchema),
  updateOrganizationHandler,
);

//************************************************************** */

router.delete(
  "/:organizationId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  requirePermissions(Permissions.ORGANIZATION_DELETE),
  validateParams(organizationIdSchema),
  archiveOrganizationHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
