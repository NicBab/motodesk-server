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

export const app = express();

app.disable("x-powered-by");

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);

app.use(morgan("dev"));
app.use(express.json());
app.use(helmet());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "MotoDesk API",
  });
});

app.use("/api/v1", apiRouter);
app.use("/api/v1/auth", authRouter);
app.use(
  "/api/v1/organizations",
  organizationRouter,
);

app.use(notFoundHandler);
app.use(errorHandler);
