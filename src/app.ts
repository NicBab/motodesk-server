import cors from "cors";
import express from "express";
import type { Request } from "express";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";

import {
  isAllowedBrowserOrigin,
} from "./config/browser-origins.js";

import {
  notFoundHandler,
} from "./middleware/not-found.js";

import {
  apiRouter,
} from "./routes/index.js";

import {
  authRouter,
} from "./modules/auth/index.js";

import {
  organizationRouter,
} from "./modules/organizations/index.js";

import {
  errorHandler,
} from "./middleware/error-handler.js";

import {
  verifyRequestOrigin,
} from "./middleware/verify-request-origin.js";

import billingWebhookRouter from "./modules/billing/billing-webhook.routes.js";

//************************************************************** */

export const app = express();

//************************************************************** */

if (env.TRUST_PROXY > 0) {
  app.set("trust proxy", env.TRUST_PROXY);
}

app.disable("x-powered-by");

//************************************************************** */

app.use(
  cors({
    origin(origin, callback) {
      // Preserve requests from integration tests, CLI clients,
      // health checks, and server-to-server consumers.
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, isAllowedBrowserOrigin(origin));
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Accept",
    ],
  }),
);

//************************************************************** */

morgan.token("safe-path", (request) => {
  const expressRequest = request as Request;

  return expressRequest.path;
});

const requestLogFormat =
  env.NODE_ENV === "production"
    ? ":method :safe-path :status :response-time ms"
    : "dev";

app.use(morgan(requestLogFormat));

app.use(helmet());

// Stripe signatures require the original request bytes.
// This endpoint authenticates through its Stripe signature.
app.use(
  "/api/v1/billing/webhook",
  billingWebhookRouter,
);

// Browser and application routes retain their existing parsers
// and request-origin protection.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(verifyRequestOrigin);

//************************************************************** */

app.get("/", (_request, response) => {
  response.status(200).json({
    success: true,
    message: "MotoDesk API",
  });
});

//************************************************************** */

app.use("/api/v1", apiRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/organizations", organizationRouter);

//************************************************************** */

app.use(notFoundHandler);
app.use(errorHandler);

//************************************************************** */


