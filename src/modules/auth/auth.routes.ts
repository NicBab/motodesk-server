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
} from "./auth.controller.js";

import {
  loginSchema,
  logoutSchema,
  refreshSessionSchema,
  registerSchema,
} from "./auth.schemas.js";

//*********************************************************************** */

const router = Router();

router.post("/register", validateRequest(registerSchema), register);

router.post("/login", validateRequest(loginSchema), login);

router.post("/refresh", validateRequest(refreshSessionSchema), refresh);

router.post("/logout", validateRequest(logoutSchema), logout);

router.post("/logout-all", authenticateRequest, logoutAll);

router.get("/me", authenticateRequest, me);

export default router;
