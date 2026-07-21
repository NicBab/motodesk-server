import { Router } from "express";

import { prisma } from "../config/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", async (_request, response) => {
  await prisma.$queryRaw`SELECT 1`;

  response.status(200).json({
    success: true,
    message: "MotoDesk API is healthy",
    database: "connected",
    timestamp: new Date().toISOString(),
  });
});