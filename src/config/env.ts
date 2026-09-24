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

  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required."),

  CLIENT_URL: z
    .url("CLIENT_URL must be a valid URL.")
    .default("http://localhost:3000"),

  MARKETING_URL: z
    .url("MARKETING_URL must be a valid URL.")
    .default("http://localhost:3001"),

  JWT_ACCESS_SECRET: z
    .string()
    .min(64, "JWT_ACCESS_SECRET must contain at least 64 characters."),

  ACCESS_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int("ACCESS_TOKEN_TTL_MINUTES must be a whole number.")
    .min(1, "Access tokens must remain valid for at least 1 minute.")
    .max(60, "Access tokens cannot remain valid for more than 60 minutes.")
    .default(15),

  REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number()
    .int("REFRESH_TOKEN_TTL_DAYS must be a whole number.")
    .min(1, "Refresh sessions must remain valid for at least 1 day.")
    .max(90, "Refresh sessions cannot remain valid for more than 90 days.")
    .default(30),

  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce
    .number()
    .int("EMAIL_VERIFICATION_TTL_MINUTES must be a whole number.")
    .min(
      5,
      "Email-verification codes must remain valid for at least 5 minutes.",
    )
    .max(
      30,
      "Email-verification codes cannot remain valid for more than 30 minutes.",
    )
    .default(15),

  PASSWORD_RESET_TTL_MINUTES: z.coerce
    .number()
    .int("PASSWORD_RESET_TTL_MINUTES must be a whole number.")
    .min(5, "Password-reset tokens must remain valid for at least 5 minutes.")
    .max(
      120,
      "Password-reset tokens cannot remain valid for more than 120 minutes.",
    )
    .default(30),

  RESEND_API_KEY: optionalEnvironmentString,

  EMAIL_FROM_NAME: z
    .string()
    .trim()
    .min(1, "EMAIL_FROM_NAME is required.")
    .default("MotoDesk"),

  EMAIL_FROM_ADDRESS: z
    .string()
    .trim()
    .email("EMAIL_FROM_ADDRESS must be a valid email address.")
    .default("noreply@mail.novaristechus.com"),

  GOOGLE_OAUTH_CLIENT_ID: optionalEnvironmentString,

  GOOGLE_OAUTH_CLIENT_SECRET: optionalEnvironmentString,

  GOOGLE_OAUTH_REDIRECT_URI: z
    .url("GOOGLE_OAUTH_REDIRECT_URI must be a valid URL.")
    .optional(),

  COOKIE_DOMAIN: optionalEnvironmentString,

  COOKIE_SECURE: booleanFromEnvironment.default(false),

COOKIE_SAME_SITE: z
  .enum(["lax", "strict", "none"])
  .default("lax"),

TRUST_PROXY: z.coerce
  .number()
  .int("TRUST_PROXY must be a whole number.")
  .min(0, "TRUST_PROXY cannot be negative.")
  .max(10, "TRUST_PROXY cannot be greater than 10.")
  .default(0),
})
.superRefine((environment, context) => {
  if (
    environment.NODE_ENV === "production" &&
    !environment.COOKIE_SECURE
  ) {
    context.addIssue({
      code: "custom",

      path: [
        "COOKIE_SECURE",
      ],

      message:
        "COOKIE_SECURE must be true in production.",
    });
  }

  if (
    environment.COOKIE_SAME_SITE === "none" &&
    !environment.COOKIE_SECURE
  ) {
    context.addIssue({
      code: "custom",

      path: [
        "COOKIE_SAME_SITE",
      ],

      message:
        'COOKIE_SAME_SITE="none" requires COOKIE_SECURE=true.',
    });
  }
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
