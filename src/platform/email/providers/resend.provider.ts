import { env } from "../../../config/env.js";

import {
  EmailConfigurationError,
  EmailDeliveryError,
} from "../email.errors.js";

import type {
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from "../email.types.js";

//************************************************************** */

const RESEND_EMAIL_ENDPOINT =
  "https://api.resend.com/emails";

//************************************************************** */

interface ResendSuccessResponse {
  id?: unknown;
}

//************************************************************** */

interface ResendErrorResponse {
  message?: unknown;

  name?: unknown;
}

//************************************************************** */

function requireApiKey(): string {
  const apiKey =
    env.RESEND_API_KEY;

  if (!apiKey) {
    throw new EmailConfigurationError(
      "Transactional email is not configured.",
    );
  }

  return apiKey;
}

//************************************************************** */

function buildFromAddress(): string {
  return `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`;
}

//************************************************************** */

async function readResponseBody(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

//************************************************************** */

function getProviderErrorMessage(
  body: unknown,
): string | null {
  if (
    typeof body !== "object" ||
    body === null
  ) {
    return null;
  }

  const candidate =
    body as ResendErrorResponse;

  return typeof candidate.message === "string"
    ? candidate.message
    : null;
}

//************************************************************** */

export class ResendEmailProvider
  implements EmailProvider
{
  async send(
    input: SendEmailInput,
  ): Promise<SendEmailResult> {
    const apiKey =
      requireApiKey();

    let response: Response;

    try {
      response =
        await fetch(
          RESEND_EMAIL_ENDPOINT,
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${apiKey}`,

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                from:
                  buildFromAddress(),

                to: [
                  input.to,
                ],

                subject:
                  input.subject,

                html:
                  input.html,

                text:
                  input.text,

                ...(input.replyTo
                  ? {
                      reply_to:
                        input.replyTo,
                    }
                  : {}),
              }),
          },
        );
    } catch (error) {
      throw new EmailDeliveryError(
        "The transactional email provider could not be reached.",
        {
          cause:
            error,
        },
      );
    }

    //************************************************************** */

    const body =
      await readResponseBody(
        response,
      );

    if (!response.ok) {
      const providerMessage =
        getProviderErrorMessage(
          body,
        );

      throw new EmailDeliveryError(
        providerMessage
          ? `Transactional email delivery failed: ${providerMessage}`
          : "Transactional email delivery failed.",
      );
    }

    //************************************************************** */

    if (
      typeof body !== "object" ||
      body === null ||
      !("id" in body) ||
      typeof (
        body as ResendSuccessResponse
      ).id !== "string"
    ) {
      throw new EmailDeliveryError(
        "The transactional email provider returned an invalid response.",
      );
    }

    return {
      messageId:
        (
          body as {
            id: string;
          }
        ).id,
    };
  }
}

//************************************************************** */