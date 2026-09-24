import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { apiRouter } from "./routes/index.js";
import cookieParser from "cookie-parser";
import { authRouter } from "./modules/auth/index.js";
import { organizationRouter } from "./modules/organizations/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { verifyRequestOrigin } from "./middleware/verify-request-origin.js";

export const app = express();

if (env.TRUST_PROXY > 0) {
  app.set("trust proxy", env.TRUST_PROXY);
}

app.disable("x-powered-by");

const allowedOrigins = new Set<string>([env.CLIENT_URL]);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header include server-to-server
      // requests, health checks, CLI clients, and integration tests.
      if (!origin) {
        callback(null, true);

        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);

        return;
      }

      callback(null, false);
    },

    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Accept"],
  }),
);

app.use(morgan("dev"));
app.use(express.json());
app.use(helmet());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());
app.use(verifyRequestOrigin);

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "MotoDesk API",
  });
});

app.use("/api/v1", apiRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/organizations", organizationRouter);

app.use(notFoundHandler);
app.use(errorHandler);
