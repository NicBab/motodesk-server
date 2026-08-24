// Endpoint declarations

import { Router } from "express";
import { authenticateRequest } from "./auth.middleware.js";
import { validateBody } from "../../platform/validation/validate-body.js";
import { initializeRequestContext } from "../../platform/request/request.middleware.js";

import { me } from "./authentication/me/index.js";

import { register, registerSchema } from "./authentication/register/index.js";

import {
  switchOrganizationHandler,
  switchOrganizationSchema,
} from "./authentication/switch-organization/index.js";

import { login, loginSchema } from "./authentication/login/index.js";

import {
  refresh,
  refreshSessionSchema,
} from "./authentication/refresh/index.js";

import { logout, logoutSchema } from "./authentication/logout/index.js";

import { logoutAll } from "./authentication/logout-all/index.js";

import {
  updateProfileHandler,
  updateProfileSchema,
} from "./identity/update-profile/index.js";

import {
  changePasswordHandler,
  changePasswordSchema,
} from "./identity/change-password/index.js";

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

import {
  verifyEmailHandler,
  verifyEmailSchema,
} from "./identity/verify-email/index.js";

import {
  resendEmailVerificationHandler,
  resendEmailVerificationSchema,
} from "./identity/resend-email-verification/index.js";

import { acceptMembershipInvitationSchema } from "../membership-invitations/membership-invitation.schemas.js";

import { acceptMembershipInvitationHandler } from "../membership-invitations/membership-invitation.controller.js";

//*********************************************************************** */

const router = Router();

router.post("/register", validateBody(registerSchema), register);

router.post("/login", validateBody(loginSchema), login);

router.post("/refresh", validateBody(refreshSessionSchema), refresh);

router.post(
  "/accept-membership-invitation",
  authenticateRequest,
  initializeRequestContext,
  validateBody(acceptMembershipInvitationSchema),
  acceptMembershipInvitationHandler,
);

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
  "/verify-email",
  validateBody(verifyEmailSchema),
  verifyEmailHandler,
);

router.post(
  "/resend-email-verification",
  validateBody(resendEmailVerificationSchema),
  resendEmailVerificationHandler,
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
