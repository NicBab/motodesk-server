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
  changePasswordSchema,
  updateProfileSchema,
} from "./auth.schemas.js";

import {
  updateProfileHandler,
} from "./identity/update-profile/index.js";

import {
  changePasswordHandler,
} from "./identity/change-password/controller.js";

import {
  changeEmailHandler,
  changeEmailSchema,
} from "./identity/change-email/index.js";

import {
  requestPasswordResetHandler,
  requestPasswordResetSchema,
} from "./identity/request-password-reset/index.js";

import {
  resetPasswordHandler,
  resetPasswordSchema,
} from "./identity/reset-password/index.js";


//*********************************************************************** */

const router = Router();

router.post("/register", validateBody(registerSchema), register);

router.post("/login", validateBody(loginSchema), login);

router.post("/refresh", validateBody(refreshSessionSchema), refresh);

router.post(
  "/switch-organization",
  authenticateRequest,
  initializeRequestContext,
  validateBody(switchOrganizationSchema),
  switchOrganizationHandler,
);

router.post(
  "/change-password",
  authenticateRequest,
  initializeRequestContext,
  validateBody(changePasswordSchema),
  changePasswordHandler,
);

router.post(
  "/request-password-reset",
  validateBody(requestPasswordResetSchema),
  requestPasswordResetHandler,
);

router.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  resetPasswordHandler,
);

router.post(
  "/change-email",
  authenticateRequest,
  initializeRequestContext,
  validateBody(changeEmailSchema),
  changeEmailHandler,
);

router.patch(
  "/profile",
  authenticateRequest,
  initializeRequestContext,
  validateBody(updateProfileSchema),
  updateProfileHandler,
);

router.post("/logout", validateBody(logoutSchema), logout);

router.post(
  "/logout-all",
  authenticateRequest,
  initializeRequestContext,
  logoutAll,
);

router.get("/me", authenticateRequest, initializeRequestContext, me);

export default router;
