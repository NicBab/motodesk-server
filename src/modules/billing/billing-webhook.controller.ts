import type { Request, Response } from "express";

import { ok } from "../../platform/http/api-response.js";

import {
  verifyBillingWebhookSignature,
} from "./billing-webhook.signature.js";

import {
  processBillingWebhookEvent,
} from "./billing-webhook.service.js";

//************************************************************** */

export async function handleBillingWebhook(
  request: Request,
  response: Response,
): Promise<void> {
  const signature = request.get("stripe-signature");

  const event = verifyBillingWebhookSignature(
    request.body,
    signature,
  );

  await processBillingWebhookEvent(event);

  ok(response, {
    received: true,
  });
}

//************************************************************** */