import { Router } from "express";

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
  archivePartHandler,
  createPartHandler,
  getPartHandler,
  listPartsHandler,
  updatePartHandler,
} from "./part.controller.js";

import {
  createPartSchema,
  listPartsQuerySchema,
  partIdSchema,
  updatePartSchema,
} from "./part.schemas.js";

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
  validateBody(createPartSchema),
  createPartHandler,
);

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateQuery(listPartsQuerySchema),
  listPartsHandler,
);

//************************************************************** */

router.get(
  "/:partId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(partIdSchema),
  getPartHandler,
);

//************************************************************** */

router.patch(
  "/:partId",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(partIdSchema),
  validateBody(updatePartSchema),
  updatePartHandler,
);

//************************************************************** */

router.post(
  "/:partId/archive",
  authenticateRequest,
  initializeRequestContext,
  requireOrganizationAccess,
  validateParams(partIdSchema),
  archivePartHandler,
);

//************************************************************** */

export default router;