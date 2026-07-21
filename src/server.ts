import type { Server } from "node:http";

import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";

let server: Server | undefined;

async function startServer(): Promise<void> {
  try {
    await prisma.$connect();

    console.log("PostgreSQL connected");

    server = app.listen(env.PORT, () => {
      console.log(
        `MotoDesk API running at http://localhost:${env.PORT}`
      );
    });
  } catch (error) {
    console.error("Failed to start MotoDesk API:");
    console.error(error);

    await prisma.$disconnect();
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received. Shutting down...`);

  if (server) {
    server.close(async () => {
      await prisma.$disconnect();

      console.log("Server stopped");
      process.exit(0);
    });

    return;
  }

  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  void shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  void shutdown("unhandledRejection");
});

void startServer();