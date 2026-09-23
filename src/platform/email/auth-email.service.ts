import {
  EMAIL_VERIFICATION_TTL_MINUTES,
} from "../../modules/auth/auth.constants.js";

import {
  sendEmail,
} from "./email.service.js";

import {
  buildEmailVerificationTemplate,
} from "./templates/email-verification.template.js";

import {
  env,
} from "../../config/env.js";

import {
  PASSWORD_RESET_TTL_MINUTES,
} from "../../modules/auth/auth.constants.js";

import {
  buildPasswordResetTemplate,
} from "./templates/password-reset.template.js";

//************************************************************** */

export interface SendEmailVerificationCodeInput {
  email: string;

  firstName: string;

  verificationCode: string;
}

//************************************************************** */

export interface SendPasswordResetEmailInput {
  email: string;

  firstName: string;

  resetToken: string;
}

//************************************************************** */

export async function sendEmailVerificationCode(
  input: SendEmailVerificationCodeInput,
): Promise<void> {
  const template =
    buildEmailVerificationTemplate({
      firstName:
        input.firstName,

      verificationCode:
        input.verificationCode,

      expiresInMinutes:
        EMAIL_VERIFICATION_TTL_MINUTES,
    });

  await sendEmail({
    to:
      input.email,

    subject:
      template.subject,

    html:
      template.html,

    text:
      template.text,
  });
}

//************************************************************** */

export async function sendPasswordResetEmail(
  input: SendPasswordResetEmailInput,
): Promise<void> {
  const resetUrl =
    new URL(
      "/reset-password",
      env.CLIENT_URL,
    );

  resetUrl.searchParams.set(
    "token",
    input.resetToken,
  );

  const template =
    buildPasswordResetTemplate({
      firstName:
        input.firstName,

      resetUrl:
        resetUrl.toString(),

      expiresInMinutes:
        PASSWORD_RESET_TTL_MINUTES,
    });

  await sendEmail({
    to:
      input.email,

    subject:
      template.subject,

    html:
      template.html,

    text:
      template.text,
  });
}

//************************************************************** */
