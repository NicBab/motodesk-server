import {
  Router,
} from "express";

import {
  validateBody,
  validateParams,
} from "../../platform/validation/index.js";


import {
  repairOrderIdSchema,
} from "./repair-order.schemas.js";

import {
  createRepairOrderPartLineHandler,
  deleteRepairOrderPartLineHandler,
  getRepairOrderPartLineHandler,
  listRepairOrderPartLinesHandler,
  updateRepairOrderPartLineHandler,
  allocateRepairOrderPartLineHandler,
  deallocateRepairOrderPartLineHandler,
  issueRepairOrderPartLineHandler,
  installRepairOrderPartLineHandler,
  markRepairOrderPartToBeOrderedHandler
} from "./repair-order-part.controller.js";

import {
  allocateRepairOrderPartSchema,
  createRepairOrderPartLineSchema,
  repairOrderPartParamsSchema,
  updateRepairOrderPartLineSchema,
  deallocateRepairOrderPartSchema,
  issueRepairOrderPartSchema,
  installRepairOrderPartSchema,
  markRepairOrderPartToBeOrderedSchema
} from "./repair-order-part.schemas.js";

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

router.post(
  "/:partLineId/allocate",
  validateParams(
    repairOrderPartParamsSchema,
  ),
  validateBody(
    allocateRepairOrderPartSchema,
  ),
  allocateRepairOrderPartLineHandler,
);

//************************************************************** */

router.post(
  "/:partLineId/deallocate",
  validateParams(
    repairOrderPartParamsSchema,
  ),
  validateBody(
    deallocateRepairOrderPartSchema,
  ),
  deallocateRepairOrderPartLineHandler,
);

//************************************************************** */

router.post(
  "/:partLineId/issue",
  validateParams(
    repairOrderPartParamsSchema,
  ),
  validateBody(
    issueRepairOrderPartSchema,
  ),
  issueRepairOrderPartLineHandler,
);

//************************************************************** */

router.post(
  "/:partLineId/install",
  validateParams(
    repairOrderPartParamsSchema,
  ),
  validateBody(
    installRepairOrderPartSchema,
  ),
  installRepairOrderPartLineHandler,
);

//************************************************************** */

router.post(
  "/:partLineId/to-be-ordered",
  validateParams(
    repairOrderPartParamsSchema,
  ),
  validateBody(
    markRepairOrderPartToBeOrderedSchema,
  ),
  markRepairOrderPartToBeOrderedHandler,
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