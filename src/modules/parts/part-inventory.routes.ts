import {
  Router,
} from "express";

import {
  validateBody,
  validateParams,
} from "../../platform/validation/index.js";

import {
  partIdSchema,
} from "./part.schemas.js";

import {
  inventoryAdjustmentSchema,
  inventoryAllocationSchema,
  inventoryCycleCountSchema,
  inventoryDamageSchema,
  inventoryDeallocationSchema,
  inventoryIssueSchema,
  inventoryReceiptSchema,
  inventoryReturnSchema,
} from "./part-inventory.schemas.js";

import {
  adjustInventoryHandler,
  allocateInventoryHandler,
  cycleCountInventoryHandler,
  damageInventoryHandler,
  deallocateInventoryHandler,
  issueInventoryHandler,
  listInventoryTransactionsHandler,
  receiveInventoryHandler,
  returnInventoryHandler,
} from "./part-inventory.controller.js";

//************************************************************** */

const router =
  Router({
    mergeParams: true,
  });

//************************************************************** */

router.post(
  "/adjust",
  validateParams(
    partIdSchema,
  ),
  validateBody(
    inventoryAdjustmentSchema,
  ),
  adjustInventoryHandler,
);

//************************************************************** */

router.post(
  "/receive",
  validateParams(
    partIdSchema,
  ),
  validateBody(
    inventoryReceiptSchema,
  ),
  receiveInventoryHandler,
);

//************************************************************** */

router.post(
  "/allocate",
  validateParams(
    partIdSchema,
  ),
  validateBody(
    inventoryAllocationSchema,
  ),
  allocateInventoryHandler,
);

//************************************************************** */

router.post(
  "/deallocate",
  validateParams(
    partIdSchema,
  ),
  validateBody(
    inventoryDeallocationSchema,
  ),
  deallocateInventoryHandler,
);

//************************************************************** */

router.post(
  "/issue",
  validateParams(
    partIdSchema,
  ),
  validateBody(
    inventoryIssueSchema,
  ),
  issueInventoryHandler,
);

//************************************************************** */

router.post(
  "/return",
  validateParams(
    partIdSchema,
  ),
  validateBody(
    inventoryReturnSchema,
  ),
  returnInventoryHandler,
);

//************************************************************** */

router.post(
  "/damage",
  validateParams(
    partIdSchema,
  ),
  validateBody(
    inventoryDamageSchema,
  ),
  damageInventoryHandler,
);

//************************************************************** */

router.post(
  "/cycle-count",
  validateParams(
    partIdSchema,
  ),
  validateBody(
    inventoryCycleCountSchema,
  ),
  cycleCountInventoryHandler,
);

//************************************************************** */

router.get(
  "/transactions",
  validateParams(
    partIdSchema,
  ),
  listInventoryTransactionsHandler,
);

//************************************************************** */

export default router;