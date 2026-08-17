import {
  Router,
} from "express";

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
  validateQuery,
} from "../../platform/validation/index.js";

import {
  createPurchaseOrderHandler,
  getPurchaseOrderHandler,
  listPurchaseOrdersHandler,
  updatePurchaseOrderHandler,
  orderPurchaseOrderHandler,
  receivePurchaseOrderLineHandler
} from "./purchase-order.controller.js";

import {
  createPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
  purchaseOrderIdSchema,
  updatePurchaseOrderSchema,
  receivePurchaseOrderLineSchema
} from "./purchase-order.schemas.js";

//************************************************************** */

const router =
  Router({
    mergeParams: true,
  });

//************************************************************** */

router.post(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateBody(
    createPurchaseOrderSchema,
  ),
  createPurchaseOrderHandler,
);

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateQuery(
    listPurchaseOrdersQuerySchema,
  ),
  listPurchaseOrdersHandler,
);

//************************************************************** */

router.get(
  "/:purchaseOrderId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(
    purchaseOrderIdSchema,
  ),
  getPurchaseOrderHandler,
);

//************************************************************** */

router.patch(
  "/:purchaseOrderId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(
    purchaseOrderIdSchema,
  ),
  validateBody(
    updatePurchaseOrderSchema,
  ),
  updatePurchaseOrderHandler,
);

//************************************************************** */

router.post(
  "/:purchaseOrderId/order",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(
    purchaseOrderIdSchema,
  ),
  orderPurchaseOrderHandler,
);

//************************************************************** */

router.post(
  "/:purchaseOrderId/receive",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(
    purchaseOrderIdSchema,
  ),
  validateBody(
    receivePurchaseOrderLineSchema,
  ),
  receivePurchaseOrderLineHandler,
);

export default router;