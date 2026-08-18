import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";

async function startServer(): Promise<void> {
  try {
    await prisma.$connect();

    console.log("Database connection established");

    const server = app.listen(env.PORT, () => {
      console.log(`MotoDesk API running on http://localhost:${env.PORT}`);
      console.log(`Health check: http://localhost:${env.PORT}/api/v1/health`);
    });

    let isShuttingDown = false;

    async function shutdown(signal: string): Promise<void> {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;

      console.log(`${signal} received. Shutting down...`);

      server.close(async (error) => {
        if (error) {
          console.error("Error closing HTTP server:", error);
        }

        await prisma.$disconnect();

        process.exit(error ? 1 : 0);
      });

      setTimeout(() => {
        console.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10_000).unref();
    }

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    console.error("Failed to start MotoDesk API:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

void startServer();
