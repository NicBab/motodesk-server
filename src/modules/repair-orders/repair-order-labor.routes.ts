import { Router } from "express";

import {
  validateBody,
  validateParams,
} from "../../platform/validation/index.js";

import {
  createRepairOrderLaborLineSchema,
  repairOrderLaborParamsSchema,
  updateRepairOrderLaborLineSchema,
} from "./repair-order-labor.schemas.js";

import {
  repairOrderIdSchema,
} from "./repair-order.schemas.js";

import {
  createRepairOrderLaborLineHandler,
  deleteRepairOrderLaborLineHandler,
  getRepairOrderLaborLineHandler,
  listRepairOrderLaborLinesHandler,
  updateRepairOrderLaborLineHandler,
} from "./repair-order-labor.controller.js";



//************************************************************** */

const router = Router({
  mergeParams: true,
});

//************************************************************** */

router.post(
  "/",
  validateParams(
    repairOrderIdSchema,
  ),
  validateBody(
    createRepairOrderLaborLineSchema,
  ),
  createRepairOrderLaborLineHandler,
);

//************************************************************** */

router.get(
  "/",
  validateParams(
    repairOrderIdSchema,
  ),
  listRepairOrderLaborLinesHandler,
);

//************************************************************** */

router.get(
  "/:laborLineId",
  validateParams(
    repairOrderLaborParamsSchema,
  ),
  getRepairOrderLaborLineHandler,
);

//************************************************************** */

router.patch(
  "/:laborLineId",
  validateParams(
    repairOrderLaborParamsSchema,
  ),
  validateBody(
    updateRepairOrderLaborLineSchema,
  ),
  updateRepairOrderLaborLineHandler,
);

//************************************************************** */


router.delete(
  "/:laborLineId",
  validateParams(
    repairOrderLaborParamsSchema,
  ),
  deleteRepairOrderLaborLineHandler,
);

//************************************************************** */

export default router;