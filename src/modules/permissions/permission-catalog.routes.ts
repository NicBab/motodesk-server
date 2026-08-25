import { Router } from "express";

import { authenticateRequest } from "../auth/index.js";

import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import { getPermissionCatalogHandler } from "./permission.controller.js";

//************************************************************** */

const router = Router();

//************************************************************** */

router.get(
  "/",
  authenticateRequest,
  initializeRequestContext,
  getPermissionCatalogHandler,
);

//************************************************************** */

export default router;

//************************************************************** */
