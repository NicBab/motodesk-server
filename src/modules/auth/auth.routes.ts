// Endpoint declarations

import { Router } from "express";
import { authenticateRequest } from "./auth.middleware.js";
import { validateRequest } from "../../middleware/validate-request.js";

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

router.post("/register", validateRequest(registerSchema), register);

router.post("/login", validateRequest(loginSchema), login);

router.post("/refresh", validateRequest(refreshSessionSchema), refresh);

router.post(
  "/switch-organization",
  authenticateRequest,
  validateRequest(switchOrganizationSchema),
  switchOrganizationHandler,
);

router.post("/logout", validateRequest(logoutSchema), logout);

router.post("/logout-all", authenticateRequest, logoutAll);

router.get("/me", authenticateRequest, me);

export default router;
