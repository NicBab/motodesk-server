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
  "Authentication logout-all audit security",
  () => {
    it(
      "revokes every session and records logout-all audit evidence",
      async () => {
        const suffix =
          randomUUID();

        const email =
          `logout-all-audit-${suffix}@motodesk.local`;

        const password =
          "MotoDesk-Logout-All-Audit-2026!";

        const primaryAgent =
          request.agent(
            app,
          );

        //************************************************************** */
        // Create the account and primary session.

        const registrationResponse =
          await primaryAgent
            .post(
              "/api/v1/auth/register",
            )
            .send({
              email,

              password,

              firstName:
                "Logout",

              lastName:
                "All",

              organization: {
                name:
                  `Logout All Audit ${suffix}`,

                slug:
                  `logout-all-audit-${suffix}`,
              },
            });

        assert.equal(
          registrationResponse.status,
          201,
        );

        const registrationBody =
          registrationResponse.body as RegistrationResponseBody;

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

        if (
          typeof userId !== "string" ||
          typeof organizationId !== "string"
        ) {
          throw new Error(
            "Registration did not return the expected identifiers.",
          );
        }

        //************************************************************** */
        // Establish two additional independent sessions.

        const secondAgent =
          request.agent(
            app,
          );

        const secondLogin =
          await secondAgent
            .post(
              "/api/v1/auth/login",
            )
            .send({
              email,
              password,
            });

        assert.equal(
          secondLogin.status,
          200,
        );

        const thirdAgent =
          request.agent(
            app,
          );

        const thirdLogin =
          await thirdAgent
            .post(
              "/api/v1/auth/login",
            )
            .send({
              email,
              password,
            });

        assert.equal(
          thirdLogin.status,
          200,
        );

        //************************************************************** */
        // Determine the primary session before logout-all destroys it.

        const sessionsResponse =
          await primaryAgent.get(
            "/api/v1/auth/sessions",
          );

        assert.equal(
          sessionsResponse.status,
          200,
        );

        const sessions =
          sessionsResponse.body
            ?.data
            ?.sessions;

        assert.equal(
          Array.isArray(
            sessions,
          ),
          true,
        );

        assert.equal(
          sessions.length,
          3,
        );

        const currentSession =
          sessions.find(
            (
              session: {
                id?: unknown;
                isCurrent?: unknown;
              },
            ) =>
              session.isCurrent ===
              true,
          );

        assert.ok(
          currentSession,
        );

        assert.equal(
          typeof currentSession.id,
          "string",
        );

        const currentSessionId =
          currentSession.id as string;

        //************************************************************** */
        // Logout-all must revoke the current session and every other
        // active session belonging to the account.

        const logoutAllResponse =
          await primaryAgent
            .post(
              "/api/v1/auth/logout-all",
            )
            .set(
              "User-Agent",
              "MotoDesk Logout All Audit Test",
            );

        assert.equal(
          logoutAllResponse.status,
          200,
        );

        assert.equal(
          logoutAllResponse.body
            ?.data
            ?.revokedSessionCount,
          3,
        );

        //************************************************************** */
        // Every previously authenticated agent must now be rejected.

        const primaryMe =
          await primaryAgent.get(
            "/api/v1/auth/me",
          );

        const secondMe =
          await secondAgent.get(
            "/api/v1/auth/me",
          );

        const thirdMe =
          await thirdAgent.get(
            "/api/v1/auth/me",
          );

        assert.equal(
          primaryMe.status,
          401,
        );

        assert.equal(
          secondMe.status,
          401,
        );

        assert.equal(
          thirdMe.status,
          401,
        );

        //************************************************************** */
        // All database sessions must also be revoked.

        const activeSessionCount =
          await prisma.session.count({
            where: {
              userId,

              revokedAt:
                null,
            },
          });

        assert.equal(
          activeSessionCount,
          0,
        );

        //************************************************************** */
        // Persisted audit evidence should identify the session from
        // which the logout-all action was initiated.

        const auditEvent =
          await prisma.auditLog.findFirst({
            where: {
              organizationId,

              actorUserId:
                userId,

              action:
                AUDIT_ACTIONS.AUTH_LOGOUT_ALL,

              resourceType:
                AUDIT_ENTITY_TYPES.SESSION,

              resourceId:
                currentSessionId,
            },

            orderBy: {
              createdAt:
                "desc",
            },
          });

        assert.ok(
          auditEvent,
          "Expected a persisted logout-all audit event.",
        );

        assert.equal(
          auditEvent.actorUserId,
          userId,
        );

        assert.equal(
          auditEvent.organizationId,
          organizationId,
        );

        assert.equal(
          auditEvent.resourceId,
          currentSessionId,
        );

        assert.equal(
          auditEvent.userAgent,
          "MotoDesk Logout All Audit Test",
        );

        //************************************************************** */
        // Credentials must never appear in persisted audit evidence.

        const serializedEvent =
          JSON.stringify(
            auditEvent,
          );

        assert.equal(
          serializedEvent.includes(
            password,
          ),
          false,
        );
      },
    );
  },
);

//************************************************************** */