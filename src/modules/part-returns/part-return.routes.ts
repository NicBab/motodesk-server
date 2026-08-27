import { Router } from "express";

import { requireOrganizationAccess } from "../organizations/organization.middleware.js";

import { validateBody, validateParams, validateQuery  } from "../../platform/validation/index.js"

import {
  archivePartReturnHandler,
  closePartReturnHandler,
  createPartReturnHandler,
  getPartReturnHandler,
  listPartReturnsHandler,
  shipPartReturnHandler,
  updatePartReturnCreditHandler,
  updatePartReturnHandler,
} from "./part-return.controller.js";

import {
  createPartReturnSchema,
  listPartReturnsQuerySchema,
  partReturnIdSchema,
  updatePartReturnCreditSchema,
  updatePartReturnSchema,
} from "./part-return.schemas.js";

//************************************************************** */

export const partReturnRouter = Router({
  mergeParams: true,
});

//************************************************************** */

partReturnRouter.use(
  requireOrganizationAccess,
);

//************************************************************** */

partReturnRouter.get(
  "/",
  validateQuery(
    listPartReturnsQuerySchema,
  ),
  listPartReturnsHandler,
);

//************************************************************** */

partReturnRouter.post(
  "/",
  validateBody(
    createPartReturnSchema,
  ),
  createPartReturnHandler,
);

//************************************************************** */

partReturnRouter.get(
  "/:partReturnId",
  validateParams(
    partReturnIdSchema,
  ),
  getPartReturnHandler,
);

//************************************************************** */

partReturnRouter.patch(
  "/:partReturnId",
  validateParams(
    partReturnIdSchema,
  ),
  validateBody(
    updatePartReturnSchema,
  ),
  updatePartReturnHandler,
);

//************************************************************** */

partReturnRouter.post(
  "/:partReturnId/ship",
  validateParams(
    partReturnIdSchema,
  ),
  shipPartReturnHandler,
);

//************************************************************** */

partReturnRouter.post(
  "/:partReturnId/credit",
  validateParams(
    partReturnIdSchema,
  ),
  validateBody(
    updatePartReturnCreditSchema,
  ),
  updatePartReturnCreditHandler,
);

//************************************************************** */

partReturnRouter.post(
  "/:partReturnId/close",
  validateParams(
    partReturnIdSchema,
  ),
  closePartReturnHandler,
);

//************************************************************** */

partReturnRouter.post(
  "/:partReturnId/archive",
  validateParams(
    partReturnIdSchema,
  ),
  archivePartReturnHandler,
);

//************************************************************** */