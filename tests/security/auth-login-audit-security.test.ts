import assert from "node:assert/strict";

import {
  randomUUID,
} from "node:crypto";

import {
  describe,
  it,
} from "node:test";

import request from "supertest";

import {
  app,
} from "../../src/app.js";

import {
  prisma,
} from "../../src/config/prisma.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../src/modules/audit/audit.constants.js";

//************************************************************** */

type RegistrationResponseBody = {
  success?: boolean;

  data?: {
    user?: {
      id?: unknown;
    };

    membership?: {
      organizationId?: unknown;
    } | null;
  };
};

//************************************************************** */

describe(
  "Authentication login audit security",
  () => {
    it(
      "records successful and failed login security events",
      async () => {
        const suffix =
          randomUUID();

        const email =
          `login-audit-${suffix}@motodesk.local`;

        const password =
          "MotoDesk-Login-Audit-2026!";

        const incorrectPassword =
          "Incorrect-Password-2026!";

        //************************************************************** */
        // Register a real local-password account with its own
        // organization.

        const registrationResponse =
          await request(app)
            .post(
              "/api/v1/auth/register",
            )
            .send({
              email,

              password,

              firstName:
                "Login",

              lastName:
                "Audit",

              organization: {
                name:
                  `Login Audit ${suffix}`,

                slug:
                  `login-audit-${suffix}`,
              },
            });

        assert.equal(
          registrationResponse.status,
          201,
        );

        const registrationBody =
          registrationResponse.body as RegistrationResponseBody;

        assert.equal(
          registrationBody.success,
          true,
        );

        const userId =
          registrationBody
            .data
            ?.user
            ?.id;

        const organizationId =
          registrationBody
            .data
            ?.membership
            ?.organizationId;

        assert.equal(
          typeof userId,
          "string",
        );

        assert.equal(
          typeof organizationId,
          "string",
        );

        //************************************************************** */
        // The assertions above narrow the runtime values. Keep explicit
        // local strings for Prisma and later assertions.

        if (
          typeof userId !== "string" ||
          typeof organizationId !== "string"
        ) {
          throw new Error(
            "Registration did not return the expected user and membership identifiers.",
          );
        }

        //************************************************************** */
        // Successful login.

        const successfulLogin =
          await request(app)
            .post(
              "/api/v1/auth/login",
            )
            .set(
              "User-Agent",
              "MotoDesk Login Audit Test",
            )
            .send({
              email,

              password,
            });

        assert.equal(
          successfulLogin.status,
          200,
        );

        //************************************************************** */
        // Failed login against the same known account.

        const failedLogin =
          await request(app)
            .post(
              "/api/v1/auth/login",
            )
            .set(
              "User-Agent",
              "MotoDesk Login Audit Test",
            )
            .send({
              email,

              password:
                incorrectPassword,
            });

        assert.equal(
          failedLogin.status,
          401,
        );

        //************************************************************** */
        // Retrieve persisted login audit evidence.

        const auditEvents =
          await prisma.auditLog.findMany({
            where: {
              organizationId,

              actorUserId:
                userId,

              action: {
                in: [
                  AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED,
                  AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
                ],
              },
            },

            orderBy: {
              createdAt:
                "asc",
            },
          });

        //************************************************************** */

        const successEvent =
          auditEvents.find(
            (event) =>
              event.action ===
              AUDIT_ACTIONS.AUTH_LOGIN_SUCCEEDED,
          );

        const failureEvent =
          auditEvents.find(
            (event) =>
              event.action ===
              AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
          );

        //************************************************************** */
        // Both authentication outcomes should produce persisted audit
        // evidence.

        assert.ok(
          successEvent,
          "Expected a persisted successful-login audit event.",
        );

        assert.ok(
          failureEvent,
          "Expected a persisted failed-login audit event.",
        );

        //************************************************************** */
        // Successful login evidence.

        assert.equal(
          successEvent.actorUserId,
          userId,
        );

        assert.equal(
          successEvent.organizationId,
          organizationId,
        );

        assert.equal(
          successEvent.resourceType,
          AUDIT_ENTITY_TYPES.USER,
        );

        assert.equal(
          successEvent.resourceId,
          userId,
        );

        assert.equal(
          successEvent.userAgent,
          "MotoDesk Login Audit Test",
        );

        //************************************************************** */
        // Failed login evidence.

        assert.equal(
          failureEvent.actorUserId,
          userId,
        );

        assert.equal(
          failureEvent.organizationId,
          organizationId,
        );

        assert.equal(
          failureEvent.resourceType,
          AUDIT_ENTITY_TYPES.USER,
        );

        assert.equal(
          failureEvent.resourceId,
          userId,
        );

        assert.equal(
          failureEvent.userAgent,
          "MotoDesk Login Audit Test",
        );

        //************************************************************** */
        // Neither successful nor failed credentials may be persisted
        // anywhere in the audit records.

        const serializedEvents =
          JSON.stringify(
            auditEvents,
          );

        assert.equal(
          serializedEvents.includes(
            password,
          ),
          false,
        );

        assert.equal(
          serializedEvents.includes(
            incorrectPassword,
          ),
          false,
        );
      },
    );
  },
);

//************************************************************** */