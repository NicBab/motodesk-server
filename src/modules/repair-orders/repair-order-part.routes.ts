import {
  Router,
} from "express";

import {
  validateBody,
  validateParams,
} from "../../platform/validation/index.js";

import {
  createRepairOrderPartLineSchema,
  repairOrderPartParamsSchema,
  updateRepairOrderPartLineSchema,
} from "./repair-order-part.schemas.js";

import {
  repairOrderIdSchema,
} from "./repair-order.schemas.js";

import {
  createRepairOrderPartLineHandler,
  deleteRepairOrderPartLineHandler,
  getRepairOrderPartLineHandler,
  listRepairOrderPartLinesHandler,
  updateRepairOrderPartLineHandler,
} from "./repair-order-part.controller.js";

//************************************************************** */

const router =
  Router({
    mergeParams: true,
  });

//************************************************************** */

router.post(
  "/",
  validateParams(
    repairOrderIdSchema,
  ),
  validateBody(
    createRepairOrderPartLineSchema,
  ),
  createRepairOrderPartLineHandler,
);

//************************************************************** */

router.get(
  "/",
  validateParams(
    repairOrderIdSchema,
  ),
  listRepairOrderPartLinesHandler,
);

//************************************************************** */

router.get(
  "/:partLineId",
  validateParams(
    repairOrderPartParamsSchema,
  ),
  getRepairOrderPartLineHandler,
);

//************************************************************** */

router.patch(
  "/:partLineId",
  validateParams(
    repairOrderPartParamsSchema,
  ),
  validateBody(
    updateRepairOrderPartLineSchema,
  ),
  updateRepairOrderPartLineHandler,
);

//************************************************************** */

router.delete(
  "/:partLineId",
  validateParams(
    repairOrderPartParamsSchema,
  ),
  deleteRepairOrderPartLineHandler,
);

//************************************************************** */

export default router;