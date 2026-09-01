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
  createPosSaleHandler,
  createSaleReturnHandler,
  getSaleHandler,
  listSalesHandler,
} from "./sale.controller.js";

import {
  createPosSaleSchema,
  createSaleReturnSchema,
  listSalesQuerySchema,
  saleIdSchema,
} from "./sale.schemas.js";

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
  validateBody(
    createPosSaleSchema,
  ),
  createPosSaleHandler,
);

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateQuery(
    listSalesQuerySchema,
  ),
  listSalesHandler,
);


//************************************************************** */

router.post(
  "/:saleId/returns",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(
    saleIdSchema,
  ),
  validateBody(
    createSaleReturnSchema,
  ),
  createSaleReturnHandler,
);

//************************************************************** */

router.get(
  "/:saleId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(
    saleIdSchema,
  ),
  getSaleHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
