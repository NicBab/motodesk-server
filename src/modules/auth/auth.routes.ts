// Endpoint declarations

import { Router } from "express";
import { authenticateRequest } from "./auth.middleware.js";
import { validateBody } from "../../platform/validation/validate-body.js";
import { initializeRequestContext } from "../../platform/request/request.middleware.js";
import {
  login,
  logout,
  logoutAll,
  refresh,
  register,
  me,
  switchOrganizationHandler,
} from "./auth.controller.js";

import {
  loginSchema,
  logoutSchema,
  refreshSessionSchema,
  registerSchema,
  switchOrganizationSchema,
} from "./auth.schemas.js";

//*********************************************************************** */

const router = Router();

router.post("/register",validateBody(registerSchema), register);

router.post("/login", validateBody(loginSchema), login);

router.post("/refresh", validateBody(refreshSessionSchema), refresh);

router.post(
  "/switch-organization",
  authenticateRequest,
  initializeRequestContext,
  validateBody(switchOrganizationSchema),
  switchOrganizationHandler,
);

router.post("/logout", validateBody(logoutSchema), logout);

router.post("/logout-all", authenticateRequest, initializeRequestContext, logoutAll);

router.get("/me", authenticateRequest, initializeRequestContext, me);

export default router;
