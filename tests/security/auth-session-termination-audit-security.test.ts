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

async function createAccount() {
  const suffix =
    randomUUID();

  const email =
    `session-termination-audit-${suffix}@motodesk.local`;

  const password =
    "MotoDesk-Session-Audit-2026!";

  const agent =
    request.agent(
      app,
    );

  const registrationResponse =
    await agent
      .post(
        "/api/v1/auth/register",
      )
      .send({
        email,

        password,

        firstName:
          "Session",

        lastName:
          "Audit",

        organization: {
          name:
            `Session Audit ${suffix}`,

          slug:
            `session-audit-${suffix}`,
        },
      });

  assert.equal(
    registrationResponse.status,
    201,
  );

  const body =
    registrationResponse.body as RegistrationResponseBody;

  const userId =
    body.data
      ?.user
      ?.id;

  const organizationId =
    body.data
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

  return {
    agent,
    email,
    password,
    userId,
    organizationId,
  };
}

//************************************************************** */

async function createAdditionalSession(
  email: string,
  password: string,
) {
  const agent =
    request.agent(
      app,
    );

  const response =
    await agent
      .post(
        "/api/v1/auth/login",
      )
      .send({
        email,
        password,
      });

  assert.equal(
    response.status,
    200,
  );

  return agent;
}

//************************************************************** */

describe(
  "Authentication session termination audit security",
  () => {
    it(
      "records logout of the current session",
      async () => {
        const {
          agent,
          userId,
          organizationId,
        } =
          await createAccount();

        //************************************************************** */
        // Resolve the exact current session through the authenticated
        // session-management endpoint.

        const sessionsResponse =
          await agent.get(
            "/api/v1/auth/sessions",
          );

        assert.equal(
          sessionsResponse.status,
          200,
        );

        const currentSession =
          sessionsResponse.body
            ?.data
            ?.sessions
            ?.find(
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

        const logoutResponse =
          await agent
            .post(
              "/api/v1/auth/logout",
            )
            .set(
              "User-Agent",
              "MotoDesk Logout Audit Test",
            )
            .send({});

        assert.equal(
          logoutResponse.status,
          200,
        );

        //************************************************************** */

        const auditEvent =
          await prisma.auditLog.findFirst({
            where: {
              organizationId,

              actorUserId:
                userId,

              action:
                AUDIT_ACTIONS.AUTH_LOGOUT,

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
          "Expected a persisted logout audit event.",
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
          "MotoDesk Logout Audit Test",
        );
      },
    );

    //************************************************************** */

    it(
      "records revocation of an individual other session",
      async () => {
        const {
          agent: primaryAgent,
          email,
          password,
          userId,
          organizationId,
        } =
          await createAccount();

        const secondAgent =
          await createAdditionalSession(
            email,
            password,
          );

        //************************************************************** */
        // Ask the primary authenticated session for its session list so
        // we can reliably identify the other device.

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

        const otherSession =
          sessions.find(
            (
              session: {
                id?: unknown;
                isCurrent?: unknown;
              },
            ) =>
              session.isCurrent ===
              false,
          );

        assert.ok(
          otherSession,
        );

        assert.equal(
          typeof otherSession.id,
          "string",
        );

        const otherSessionId =
          otherSession.id as string;

        //************************************************************** */

        const revokeResponse =
          await primaryAgent
            .delete(
              `/api/v1/auth/sessions/${otherSessionId}`,
            )
            .set(
              "User-Agent",
              "MotoDesk Session Revoke Audit Test",
            );

        assert.equal(
          revokeResponse.status,
          200,
        );

        //************************************************************** */
        // Prove the target session was actually terminated.

        const revokedSessionResponse =
          await secondAgent.get(
            "/api/v1/auth/me",
          );

        assert.equal(
          revokedSessionResponse.status,
          401,
        );

        //************************************************************** */

        const auditEvent =
          await prisma.auditLog.findFirst({
            where: {
              organizationId,

              actorUserId:
                userId,

              action:
                AUDIT_ACTIONS.AUTH_LOGOUT,

              resourceType:
                AUDIT_ENTITY_TYPES.SESSION,

              resourceId:
                otherSessionId,
            },

            orderBy: {
              createdAt:
                "desc",
            },
          });

        assert.ok(
          auditEvent,
          "Expected a persisted individual-session revocation audit event.",
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
          otherSessionId,
        );

        assert.equal(
          auditEvent.userAgent,
          "MotoDesk Session Revoke Audit Test",
        );
      },
    );

    //************************************************************** */

    it(
      "records revocation of all other sessions",
      async () => {
        const {
          agent: primaryAgent,
          email,
          password,
          userId,
          organizationId,
        } =
          await createAccount();

        const secondAgent =
          await createAdditionalSession(
            email,
            password,
          );

        const thirdAgent =
          await createAdditionalSession(
            email,
            password,
          );

        //************************************************************** */

        const sessionsBeforeResponse =
          await primaryAgent.get(
            "/api/v1/auth/sessions",
          );

        assert.equal(
          sessionsBeforeResponse.status,
          200,
        );

        const sessionsBefore =
          sessionsBeforeResponse.body
            ?.data
            ?.sessions;

        assert.equal(
          Array.isArray(
            sessionsBefore,
          ),
          true,
        );

        assert.equal(
          sessionsBefore.length,
          3,
        );

        const currentSession =
          sessionsBefore.find(
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

        const revokeResponse =
          await primaryAgent
            .delete(
              "/api/v1/auth/sessions/others",
            )
            .set(
              "User-Agent",
              "MotoDesk Revoke Others Audit Test",
            );

        assert.equal(
          revokeResponse.status,
          200,
        );

        assert.equal(
          typeof revokeResponse.body
            ?.data
            ?.revokedSessionCount,
          "number",
        );

        assert.equal(
          revokeResponse.body
            .data
            .revokedSessionCount,
          2,
        );

        //************************************************************** */
        // Current session survives.

        const primaryMeResponse =
          await primaryAgent.get(
            "/api/v1/auth/me",
          );

        assert.equal(
          primaryMeResponse.status,
          200,
        );

        //************************************************************** */
        // Other sessions are invalidated.

        const secondMeResponse =
          await secondAgent.get(
            "/api/v1/auth/me",
          );

        const thirdMeResponse =
          await thirdAgent.get(
            "/api/v1/auth/me",
          );

        assert.equal(
          secondMeResponse.status,
          401,
        );

        assert.equal(
          thirdMeResponse.status,
          401,
        );

        //************************************************************** */

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
          "Expected persisted audit evidence for revoking all other sessions.",
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
          auditEvent.userAgent,
          "MotoDesk Revoke Others Audit Test",
        );

        //************************************************************** */
        // Audit data must not contain authentication credentials.

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