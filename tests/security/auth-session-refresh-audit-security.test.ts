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
  "Authentication session refresh audit security",
  () => {
    it(
      "records successful session refreshes without exposing tokens",
      async () => {
        const suffix =
          randomUUID();

        const email =
          `refresh-audit-${suffix}@motodesk.local`;

        const password =
          "MotoDesk-Refresh-Audit-2026!";

        const agent =
          request.agent(
            app,
          );

        //************************************************************** */
        // Register through an agent so its authentication cookies are
        // retained for the refresh request.

        const registrationResponse =
          await agent
            .post(
              "/api/v1/auth/register",
            )
            .send({
              email,

              password,

              firstName:
                "Refresh",

              lastName:
                "Audit",

              organization: {
                name:
                  `Refresh Audit ${suffix}`,

                slug:
                  `refresh-audit-${suffix}`,
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
            "Registration did not return the expected user and organization identifiers.",
          );
        }

        //************************************************************** */
        // Capture the active session before refresh.

        const sessionsBeforeRefresh =
          await prisma.session.findMany({
            where: {
              userId,

              revokedAt:
                null,
            },

            orderBy: {
              createdAt:
                "desc",
            },
          });

        assert.equal(
          sessionsBeforeRefresh.length,
          1,
        );

        const sessionId =
          sessionsBeforeRefresh[0]?.id;

        assert.equal(
          typeof sessionId,
          "string",
        );

        if (
          typeof sessionId !== "string"
        ) {
          throw new Error(
            "Expected an active authentication session.",
          );
        }

        //************************************************************** */
        // Refresh using the real refresh-token cookie retained by the
        // Supertest agent.

        const refreshResponse =
          await agent
            .post(
              "/api/v1/auth/refresh",
            )
            .set(
              "User-Agent",
              "MotoDesk Refresh Audit Test",
            );

        assert.equal(
          refreshResponse.status,
          200,
        );

        //************************************************************** */
        // Successful refresh should leave persisted evidence tied to the
        // actual session that was rotated.

        const refreshEvent =
          await prisma.auditLog.findFirst({
            where: {
              organizationId,

              actorUserId:
                userId,

              action:
                AUDIT_ACTIONS.AUTH_SESSION_REFRESHED,

              resourceType:
                AUDIT_ENTITY_TYPES.SESSION,

              resourceId:
                sessionId,
            },

            orderBy: {
              createdAt:
                "desc",
            },
          });

        assert.ok(
          refreshEvent,
          "Expected a persisted successful session-refresh audit event.",
        );

        assert.equal(
          refreshEvent.actorUserId,
          userId,
        );

        assert.equal(
          refreshEvent.organizationId,
          organizationId,
        );

        assert.equal(
          refreshEvent.resourceType,
          AUDIT_ENTITY_TYPES.SESSION,
        );

        assert.equal(
          refreshEvent.resourceId,
          sessionId,
        );

        assert.equal(
          refreshEvent.userAgent,
          "MotoDesk Refresh Audit Test",
        );

        //************************************************************** */
        // Neither credentials nor refresh/access tokens should appear in
        // the persisted audit event.

        const serializedEvent =
          JSON.stringify(
            refreshEvent,
          );

        assert.equal(
          serializedEvent.includes(
            password,
          ),
          false,
        );

        assert.equal(
          serializedEvent
            .toLowerCase()
            .includes(
              "refreshtoken",
            ),
          false,
        );

        assert.equal(
          serializedEvent
            .toLowerCase()
            .includes(
              "accesstoken",
            ),
          false,
        );
      },
    );
  },
);

//************************************************************** */