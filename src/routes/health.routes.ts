import { Router } from "express";

import { prisma } from "../config/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      status: "healthy",
      services: {
        api: "up",
        database: "up",
      },
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check database failure:", error);

    res.status(503).json({
      success: false,
      status: "unhealthy",
      services: {
        api: "up",
        database: "down",
      },
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  }
});
