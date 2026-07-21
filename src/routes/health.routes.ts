// import { Router } from "express";

// import { prisma } from "../config/prisma.js";

// export const healthRouter = Router();

// healthRouter.get("/", async (_request, response) => {
//   await prisma.$queryRaw`SELECT 1`;

//   response.status(200).json({
//     success: true,
//     message: "MotoDesk API is healthy",
//     database: "connected",
//     timestamp: new Date().toISOString(),
//   });
// });



// import { Router } from "express";

// export const healthRouter = Router();

// healthRouter.get("/", (_req, res) => {
//   res.status(200).json({
//     success: true,
//     status: "healthy",
//     message: "MotoDesk API is running",
//     timestamp: new Date().toISOString(),
//   });
// });


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