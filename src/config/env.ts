import "dotenv/config";

import { z } from "zod";

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  return value;
}, z.boolean());

const optionalEnvironmentString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
}, z.string().min(1).optional());

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int("PORT must be a whole number.")
    .min(1, "PORT must be at least 1.")
    .max(65_535, "PORT cannot be greater than 65535.")
    .default(5001),

  DATABASE_URL: z
    .string()
    .trim()
    .min(1, "DATABASE_URL is required."),

  CLIENT_URL: z
    .url("CLIENT_URL must be a valid URL.")
    .default("http://localhost:3000"),

  MARKETING_URL: z
    .url("MARKETING_URL must be a valid URL.")
    .default("http://localhost:3001"),

  JWT_ACCESS_SECRET: z
    .string()
    .min(
      64,
      "JWT_ACCESS_SECRET must contain at least 64 characters.",
    ),

  ACCESS_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int("ACCESS_TOKEN_TTL_MINUTES must be a whole number.")
    .min(1, "Access tokens must remain valid for at least 1 minute.")
    .max(
      60,
      "Access tokens cannot remain valid for more than 60 minutes.",
    )
    .default(15),

  REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number()
    .int("REFRESH_TOKEN_TTL_DAYS must be a whole number.")
    .min(1, "Refresh sessions must remain valid for at least 1 day.")
    .max(
      90,
      "Refresh sessions cannot remain valid for more than 90 days.",
    )
    .default(30),

  EMAIL_VERIFICATION_TTL_HOURS: z.coerce
    .number()
    .int("EMAIL_VERIFICATION_TTL_HOURS must be a whole number.")
    .min(
      1,
      "Email-verification tokens must remain valid for at least 1 hour.",
    )
    .max(
      72,
      "Email-verification tokens cannot remain valid for more than 72 hours.",
    )
    .default(24),

  PASSWORD_RESET_TTL_MINUTES: z.coerce
    .number()
    .int("PASSWORD_RESET_TTL_MINUTES must be a whole number.")
    .min(
      5,
      "Password-reset tokens must remain valid for at least 5 minutes.",
    )
    .max(
      120,
      "Password-reset tokens cannot remain valid for more than 120 minutes.",
    )
    .default(30),

  COOKIE_DOMAIN: optionalEnvironmentString,

  COOKIE_SECURE: booleanFromEnvironment.default(false),

  COOKIE_SAME_SITE: z
    .enum(["lax", "strict", "none"])
    .default("lax"),
});

const parsedEnvironment = envSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error("\nInvalid MotoDesk environment configuration:\n");

  for (const issue of parsedEnvironment.error.issues) {
    const variableName = issue.path.join(".") || "environment";

    console.error(`- ${variableName}: ${issue.message}`);
  }

  console.error(
    "\nCorrect the variables in your .env file and restart the server.\n",
  );

  process.exit(1);
}

export const env = parsedEnvironment.data;

export type Environment = typeof env;