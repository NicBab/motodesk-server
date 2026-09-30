import assert from "node:assert/strict";

import { spawnSync } from "node:child_process";

import { describe, it } from "node:test";

import { fileURLToPath } from "node:url";

import { dirname, resolve } from "node:path";

//************************************************************** */
// PATHS

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const projectRoot = resolve(currentDirectory, "../..");

//************************************************************** */
// BASELINE
//
// Every environment variable relevant to src/config/env.ts is supplied
// explicitly.
//
// This is important because env.ts imports dotenv/config. dotenv does not
// replace environment variables that already exist, so these values take
// precedence over the developer's local .env file.

const validSecret = "a".repeat(64);

const baseEnvironment: Record<string, string> = {
  NODE_ENV: "production",

  PORT: "5001",

  DATABASE_URL: "postgresql://motodesk:test@localhost:5432/motodesk",

  CLIENT_URL: "https://app.example.com",

  MARKETING_URL: "https://www.example.com",

  JWT_ACCESS_SECRET: validSecret,

  ACCESS_TOKEN_TTL_MINUTES: "15",

  REFRESH_TOKEN_TTL_DAYS: "30",

  EMAIL_VERIFICATION_TTL_MINUTES: "15",

  PASSWORD_RESET_TTL_MINUTES: "30",

  RESEND_API_KEY: "",

  EMAIL_FROM_NAME: "MotoDesk",

  EMAIL_FROM_ADDRESS: "noreply@example.com",

  // GOOGLE_OAUTH_CLIENT_ID:
  //   "",

  // GOOGLE_OAUTH_CLIENT_SECRET:
  //   "",

  // GOOGLE_OAUTH_REDIRECT_URI:
  //   "",

  COOKIE_DOMAIN: "",

  COOKIE_SECURE: "true",

  COOKIE_SAME_SITE: "lax",

  TRUST_PROXY: "1",
};

//************************************************************** */

type EnvironmentOverrides = Record<string, string>;

//************************************************************** */

function runEnvironmentCheck(
  overrides:
    EnvironmentOverrides = {},
) {
  const environment:
    NodeJS.ProcessEnv = {
      ...process.env,

      ...baseEnvironment,

      //************************************************************** */
      // Prevent dotenv from loading the developer's real .env file.
      //
      // The security test supplies its entire relevant configuration
      // explicitly. Pointing dotenv at a nonexistent file prevents
      // optional values from leaking into isolated test cases while
      // allowing cwd to remain at the project root so tsx resolves.

      DOTENV_CONFIG_PATH:
        resolve(
          projectRoot,
          ".env.security-test-does-not-exist",
        ),
    };

  //************************************************************** */
  // OAuth is optional by default.

  delete environment.GOOGLE_OAUTH_CLIENT_ID;
  delete environment.GOOGLE_OAUTH_CLIENT_SECRET;
  delete environment.GOOGLE_OAUTH_REDIRECT_URI;

  //************************************************************** */
  // Apply this test's explicit configuration last.

  Object.assign(
    environment,
    overrides,
  );

  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",

      "--eval",
      'await import("./src/config/env.ts");',
    ],
    {
      cwd:
        projectRoot,

      env:
        environment,

      encoding:
        "utf8",
    },
  );
}

//************************************************************** */

function getProcessOutput(
  result: ReturnType<typeof runEnvironmentCheck>,
): string {
  return [result.stdout ?? "", result.stderr ?? ""].join("\n");
}

//************************************************************** */

function assertConfigurationAccepted(overrides: EnvironmentOverrides = {}) {
  const result = runEnvironmentCheck(overrides);

  assert.equal(result.error, undefined);

  assert.equal(
    result.status,
    0,
    [
      "Expected environment configuration to be accepted.",
      "",
      "STDOUT:",
      result.stdout,
      "",
      "STDERR:",
      result.stderr,
    ].join("\n"),
  );
}

//************************************************************** */

function assertConfigurationRejected(
  overrides: EnvironmentOverrides,
  expectedMessage: string,
) {
  const result = runEnvironmentCheck(overrides);

  assert.equal(result.error, undefined);

  assert.equal(
    result.status,
    1,
    [
      "Expected environment configuration to be rejected.",
      "",
      "STDOUT:",
      result.stdout,
      "",
      "STDERR:",
      result.stderr,
    ].join("\n"),
  );

  const output = getProcessOutput(result);

  assert.equal(
    output.includes("Invalid MotoDesk environment configuration:"),
    true,
    output,
  );

  assert.equal(
    output.includes(expectedMessage),
    true,
    [
      `Expected validation output to contain: ${expectedMessage}`,
      "",
      output,
    ].join("\n"),
  );
}

//************************************************************** */

describe("Environment configuration security", () => {
  it("accepts a valid production configuration", () => {
    assertConfigurationAccepted();
  });

  //************************************************************** */

  it("rejects a missing JWT access secret", () => {
    assertConfigurationRejected(
      {
        JWT_ACCESS_SECRET: "",
      },

      "JWT_ACCESS_SECRET must contain at least 64 characters.",
    );
  });

  //************************************************************** */

  it("rejects a short JWT access secret", () => {
    assertConfigurationRejected(
      {
        JWT_ACCESS_SECRET: "too-short",
      },

      "JWT_ACCESS_SECRET must contain at least 64 characters.",
    );
  });

  //************************************************************** */

  it("rejects an empty database URL", () => {
    assertConfigurationRejected(
      {
        DATABASE_URL: "",
      },

      "DATABASE_URL is required.",
    );
  });

  //************************************************************** */

  it("rejects insecure cookies in production", () => {
    assertConfigurationRejected(
      {
        COOKIE_SECURE: "false",
      },

      "COOKIE_SECURE must be true in production.",
    );
  });

  //************************************************************** */

  it('rejects SameSite="none" without secure cookies', () => {
    assertConfigurationRejected(
      {
        NODE_ENV: "development",

        COOKIE_SECURE: "false",

        COOKIE_SAME_SITE: "none",
      },

      'COOKIE_SAME_SITE="none" requires COOKIE_SECURE=true.',
    );
  });

  //************************************************************** */

it(
  "rejects an invalid client URL",
  () => {
    assertConfigurationRejected(
      {
        CLIENT_URL:
          "not-a-url",
      },

      "CLIENT_URL must be a valid URL.",
    );
  },
);

  //************************************************************** */

it(
  "rejects an invalid marketing URL",
  () => {
    assertConfigurationRejected(
      {
        MARKETING_URL:
          "not-a-url",
      },

      "MARKETING_URL must be a valid URL.",
    );
  },
);

  //************************************************************** */

  it("rejects a server port below the valid range", () => {
    assertConfigurationRejected(
      {
        PORT: "0",
      },

      "PORT must be at least 1.",
    );
  });

  //************************************************************** */

  it("rejects a server port above the valid range", () => {
    assertConfigurationRejected(
      {
        PORT: "65536",
      },

      "PORT cannot be greater than 65535.",
    );
  });

  //************************************************************** */

  it("rejects an excessive access-token lifetime", () => {
    assertConfigurationRejected(
      {
        ACCESS_TOKEN_TTL_MINUTES: "61",
      },

      "Access tokens cannot remain valid for more than 60 minutes.",
    );
  });

  //************************************************************** */

  it("rejects an excessive refresh-session lifetime", () => {
    assertConfigurationRejected(
      {
        REFRESH_TOKEN_TTL_DAYS: "91",
      },

      "Refresh sessions cannot remain valid for more than 90 days.",
    );
  });

  //************************************************************** */

  it("rejects an email-verification lifetime below the minimum", () => {
    assertConfigurationRejected(
      {
        EMAIL_VERIFICATION_TTL_MINUTES: "4",
      },

      "Email-verification codes must remain valid for at least 5 minutes.",
    );
  });

  //************************************************************** */

  it("rejects an email-verification lifetime above the maximum", () => {
    assertConfigurationRejected(
      {
        EMAIL_VERIFICATION_TTL_MINUTES: "31",
      },

      "Email-verification codes cannot remain valid for more than 30 minutes.",
    );
  });

  //************************************************************** */

  it("rejects a password-reset lifetime below the minimum", () => {
    assertConfigurationRejected(
      {
        PASSWORD_RESET_TTL_MINUTES: "4",
      },

      "Password-reset tokens must remain valid for at least 5 minutes.",
    );
  });

  //************************************************************** */

  it("rejects a password-reset lifetime above the maximum", () => {
    assertConfigurationRejected(
      {
        PASSWORD_RESET_TTL_MINUTES: "121",
      },

      "Password-reset tokens cannot remain valid for more than 120 minutes.",
    );
  });

  //************************************************************** */

  it("rejects a negative trust-proxy value", () => {
    assertConfigurationRejected(
      {
        TRUST_PROXY: "-1",
      },

      "TRUST_PROXY cannot be negative.",
    );
  });

  //************************************************************** */

  it("rejects an excessive trust-proxy value", () => {
    assertConfigurationRejected(
      {
        TRUST_PROXY: "11",
      },

      "TRUST_PROXY cannot be greater than 10.",
    );
  });

  //************************************************************** */

  it("rejects an invalid cookie SameSite value", () => {
    assertConfigurationRejected(
      {
        COOKIE_SAME_SITE: "invalid",
      },

      "COOKIE_SAME_SITE",
    );
  });

  //************************************************************** */

  it("rejects an invalid boolean cookie-secure value", () => {
    assertConfigurationRejected(
      {
        COOKIE_SECURE: "yes",
      },

      "COOKIE_SECURE",
    );
  });

  //************************************************************** */

it(
  "rejects an invalid Google OAuth redirect URL when configured",
  () => {
    assertConfigurationRejected(
      {
        GOOGLE_OAUTH_CLIENT_ID:
          "motodesk-test-client",

        GOOGLE_OAUTH_CLIENT_SECRET:
          "motodesk-test-client-secret",

        GOOGLE_OAUTH_REDIRECT_URI:
          "not-a-url",
      },

      "GOOGLE_OAUTH_REDIRECT_URI must be a valid URL.",
    );
  },
);

  //************************************************************** */

  it("accepts valid Google OAuth configuration when configured", () => {
    assertConfigurationAccepted({
      GOOGLE_OAUTH_CLIENT_ID: "motodesk-test-client",

      GOOGLE_OAUTH_CLIENT_SECRET: "motodesk-test-client-secret",

      GOOGLE_OAUTH_REDIRECT_URI:
        "https://api.example.com/api/v1/auth/google/callback",
    });
  });

  //************************************************************** */

  it("accepts SameSite none when secure cookies are enabled", () => {
    assertConfigurationAccepted({
      COOKIE_SECURE: "true",

      COOKIE_SAME_SITE: "none",
    });
  });
  //************************************************************** */

  it("rejects an insecure client URL in production", () => {
    assertConfigurationRejected(
      {
        CLIENT_URL: "http://app.example.com",
      },

      "CLIENT_URL must use HTTPS in production.",
    );
  });

  //************************************************************** */

  it("allows an HTTP client URL in development", () => {
    assertConfigurationAccepted({
      NODE_ENV: "development",

      CLIENT_URL: "http://localhost:3000",

      COOKIE_SECURE: "false",
    });
  });

  //************************************************************** */

  it("rejects an insecure marketing URL in production", () => {
    assertConfigurationRejected(
      {
        MARKETING_URL: "http://www.example.com",
      },

      "MARKETING_URL must use HTTPS in production.",
    );
  });

  //************************************************************** */

  it("allows an HTTP marketing URL in development", () => {
    assertConfigurationAccepted({
      NODE_ENV: "development",

      MARKETING_URL: "http://localhost:3001",

      COOKIE_SECURE: "false",
    });
  });

  //************************************************************** */

  it("rejects partially configured Google OAuth with only a client ID", () => {
    assertConfigurationRejected(
      {
        GOOGLE_OAUTH_CLIENT_ID: "motodesk-test-client",
      },

      "Google OAuth must be fully configured",
    );
  });

  //************************************************************** */

  it("rejects partially configured Google OAuth without a redirect URI", () => {
    assertConfigurationRejected(
      {
        GOOGLE_OAUTH_CLIENT_ID: "motodesk-test-client",

        GOOGLE_OAUTH_CLIENT_SECRET: "motodesk-test-client-secret",
      },

      "Google OAuth must be fully configured",
    );
  });

  //************************************************************** */

  it("rejects an insecure Google OAuth redirect URI in production", () => {
    assertConfigurationRejected(
      {
        GOOGLE_OAUTH_CLIENT_ID: "motodesk-test-client",

        GOOGLE_OAUTH_CLIENT_SECRET: "motodesk-test-client-secret",

        GOOGLE_OAUTH_REDIRECT_URI:
          "http://api.example.com/api/v1/auth/google/callback",
      },

      "GOOGLE_OAUTH_REDIRECT_URI must use HTTPS in production.",
    );
  });

  //************************************************************** */

  it("allows an HTTP Google OAuth redirect URI in development", () => {
    assertConfigurationAccepted({
      NODE_ENV: "development",

      COOKIE_SECURE: "false",

      GOOGLE_OAUTH_CLIENT_ID: "motodesk-test-client",

      GOOGLE_OAUTH_CLIENT_SECRET: "motodesk-test-client-secret",

      GOOGLE_OAUTH_REDIRECT_URI:
        "http://localhost:5001/api/v1/auth/google/callback",
    });
  });
});

//************************************************************** */
