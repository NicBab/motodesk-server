import { env } from "./env.js";

//************************************************************** */

type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

//************************************************************** */

interface LogEntry {
  timestamp: string;

  level: LogLevel;

  service: string;

  environment: string;

  message: string;

  context?: LogContext;
}

//************************************************************** */

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,

      message: value.message,

      stack: env.NODE_ENV === "development" ? value.stack : undefined,

      cause: value.cause,
    };
  }

  return value;
}

//************************************************************** */

function serializeContext(
  context: LogContext | undefined,
): LogContext | undefined {
  if (!context) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, serializeValue(value)]),
  );
}

//************************************************************** */

function writeLog(
  level: LogLevel,
  message: string,
  context?: LogContext,
): void {
  const serializedContext = serializeContext(context);

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),

    level,

    service: "motodesk-server",

    environment: env.NODE_ENV,

    message,
  };

  if (serializedContext) {
    entry.context = serializedContext;
  }

  const output = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(output);

      return;

    case "warn":
      console.warn(output);

      return;

    default:
      console.log(output);
  }
}

//************************************************************** */

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (env.NODE_ENV !== "development") {
      return;
    }

    writeLog("debug", message, context);
  },

  info(message: string, context?: LogContext): void {
    writeLog("info", message, context);
  },

  warn(message: string, context?: LogContext): void {
    writeLog("warn", message, context);
  },

  error(message: string, context?: LogContext): void {
    writeLog("error", message, context);
  },
};

//************************************************************** */
