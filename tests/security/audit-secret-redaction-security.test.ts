import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import {
  sanitizeAuditValue,
} from "../../src/modules/audit/audit.utils.js";

//************************************************************** */

describe(
  "Audit secret redaction security",
  () => {
    it(
      "redacts authentication credentials from audit values",
      () => {
        const sanitized =
          sanitizeAuditValue({
            password:
              "SuperSecretPassword!",

            passwordHash:
              "$argon2id$secret-hash",

            currentPassword:
              "CurrentPassword!",

            newPassword:
              "NewPassword!",

            confirmPassword:
              "NewPassword!",

            accessToken:
              "access-token-secret",

            refreshToken:
              "refresh-token-secret",

            token:
              "one-time-token-secret",

            tokenHash:
              "one-time-token-hash",

            secret:
              "application-secret",

            authorization:
              "Bearer secret-token",

            cookie:
              "motodesk_access_token=secret",

            "set-cookie":
              "motodesk_refresh_token=secret",

            apiKey:
              "api-key-secret",

            privateKey:
              "private-key-secret",
          }) as Record<
            string,
            unknown
          >;

        for (
          const value
          of Object.values(
            sanitized,
          )
        ) {
          assert.equal(
            value,
            "[REDACTED]",
          );
        }
      },
    );

    //************************************************************** */

    it(
      "redacts sensitive fields recursively inside nested metadata",
      () => {
        const sanitized =
          sanitizeAuditValue({
            request: {
              email:
                "user@example.com",

              credentials: {
                password:
                  "nested-password",

                accessToken:
                  "nested-access-token",
              },
            },

            changes: {
              before: {
                refreshToken:
                  "old-refresh-token",
              },

              after: {
                tokenHash:
                  "new-token-hash",
              },
            },
          }) as {
            request: {
              email: string;

              credentials: {
                password: string;
                accessToken: string;
              };
            };

            changes: {
              before: {
                refreshToken: string;
              };

              after: {
                tokenHash: string;
              };
            };
          };

        assert.equal(
          sanitized.request.email,
          "user@example.com",
        );

        assert.equal(
          sanitized.request
            .credentials
            .password,
          "[REDACTED]",
        );

        assert.equal(
          sanitized.request
            .credentials
            .accessToken,
          "[REDACTED]",
        );

        assert.equal(
          sanitized.changes
            .before
            .refreshToken,
          "[REDACTED]",
        );

        assert.equal(
          sanitized.changes
            .after
            .tokenHash,
          "[REDACTED]",
        );
      },
    );

    //************************************************************** */

    it(
      "redacts sensitive field names regardless of casing",
      () => {
        const sanitized =
          sanitizeAuditValue({
            PASSWORD:
              "password-secret",

            AccessToken:
              "access-secret",

            REFRESHTOKEN:
              "refresh-secret",

            Authorization:
              "Bearer secret",

            ApiKey:
              "api-secret",
          }) as Record<
            string,
            unknown
          >;

        for (
          const value
          of Object.values(
            sanitized,
          )
        ) {
          assert.equal(
            value,
            "[REDACTED]",
          );
        }
      },
    );

    //************************************************************** */

    it(
      "preserves non-sensitive security metadata",
      () => {
        const sanitized =
          sanitizeAuditValue({
            action:
              "auth.password_changed",

            userId:
              "user-123",

            sessionId:
              "session-123",

            requestId:
              "request-123",

            ipAddress:
              "127.0.0.1",

            userAgent:
              "MotoDesk Security Test",

            revokedSessionCount:
              3,
          });

        assert.deepEqual(
          sanitized,
          {
            action:
              "auth.password_changed",

            userId:
              "user-123",

            sessionId:
              "session-123",

            requestId:
              "request-123",

            ipAddress:
              "127.0.0.1",

            userAgent:
              "MotoDesk Security Test",

            revokedSessionCount:
              3,
          },
        );
      },
    );

    //************************************************************** */

    it(
      "handles circular audit metadata without throwing or serializing recursively",
      () => {
        const metadata:
          Record<
            string,
            unknown
          > = {
            action:
              "security-test",
        };

        metadata.self =
          metadata;

        const sanitized =
          sanitizeAuditValue(
            metadata,
          ) as {
            action: string;
            self: string;
          };

        assert.equal(
          sanitized.action,
          "security-test",
        );

        assert.equal(
          sanitized.self,
          "[CIRCULAR]",
        );
      },
    );

    //************************************************************** */

    it(
      "limits deeply nested audit metadata",
      () => {
        const metadata: {
          child?: unknown;
        } = {};

        let current =
          metadata;

        for (
          let depth = 0;
          depth < 20;
          depth += 1
        ) {
          const child: {
            child?: unknown;
          } = {};

          current.child =
            child;

          current =
            child;
        }

        const serialized =
          JSON.stringify(
            sanitizeAuditValue(
              metadata,
            ),
          );

        assert.equal(
          serialized.includes(
            "[MAX_DEPTH_REACHED]",
          ),
          true,
        );
      },
    );
  },
);

//************************************************************** */