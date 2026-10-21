import { Router, raw } from "express";

import {
  preventSensitiveResponseCaching,
} from "../../middleware/sensitive-response-cache.js";

import {
  handleBillingWebhook,
} from "./billing-webhook.controller.js";

//************************************************************** */

const router = Router();

//************************************************************** */

router.post(
  "/",
  preventSensitiveResponseCaching,
  raw({
    type: "application/json",
    limit: "1mb",
    inflate: false,
  }),
  handleBillingWebhook,
);

//************************************************************** */

export default router;

//************************************************************** */