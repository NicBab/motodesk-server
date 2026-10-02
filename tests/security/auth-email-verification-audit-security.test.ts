import assert from "node:assert/strict";

import {
  randomUUID,
} from "node:crypto";

import {
  describe,
  it,
} from "node:test";

import {
  prisma,
} from "../../src/config/prisma.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../src/modules/audit/audit.constants.js";

import {
  createEmailVerificationAuthToken,
} from "../../src/modules/auth/tokens/one-time-token.service.js";

import {
  verifyEmail,
} from "../../src/modules/auth/identity/verify-email/service.js";

//************************************************************** */

describe(
  "Email verification audit security",
  () => {
    it(
      "records successful email verification without exposing the verification token",
      async () => {
        const suffix =
          randomUUID();

        //************************************************************** */
        // Create an isolated user directly for this service-level
        // security test.

        const user =
          await prisma.user.create({
            data: {
              email:
                `verification-audit-${suffix}@motodesk.local`,

              firstName:
                "Verification",

              lastName:
                "Audit",

              isActive:
                true,
            },
          });

        assert.equal(
          user.emailVerifiedAt,
          null,
        );

        //************************************************************** */
        // Generate the real one-time verification credential.
        //
        // AuthToken persistence contains only its hash. The plaintext
        // token exists here solely so we can exercise verifyEmail().

        const verificationToken =
          await createEmailVerificationAuthToken(
            user.id,
          );

        assert.equal(
          typeof verificationToken.token,
          "string",
        );

        //************************************************************** */

        await verifyEmail({
          token:
            verificationToken.token,
        });

        //************************************************************** */
        // Verification itself must have succeeded.

        const verifiedUser =
          await prisma.user.findUnique({
            where: {
              id:
                user.id,
            },

            select: {
              emailVerifiedAt:
                true,
            },
          });

        assert.ok(
          verifiedUser,
        );

        assert.ok(
          verifiedUser.emailVerifiedAt,
        );

        //************************************************************** */
        // Successful identity verification should leave persistent
        // security evidence.

        const auditEvent =
          await prisma.auditLog.findFirst({
            where: {
              actorUserId:
                user.id,

              action:
                AUDIT_ACTIONS.AUTH_EMAIL_VERIFIED,

              resourceType:
                AUDIT_ENTITY_TYPES.USER,

              resourceId:
                user.id,
            },

            orderBy: {
              createdAt:
                "desc",
            },
          });

        assert.ok(
          auditEvent,
          "Expected a persisted email-verification audit event.",
        );

        assert.equal(
          auditEvent.actorUserId,
          user.id,
        );

        assert.equal(
          auditEvent.resourceType,
          AUDIT_ENTITY_TYPES.USER,
        );

        assert.equal(
          auditEvent.resourceId,
          user.id,
        );

        //************************************************************** */
        // The plaintext verification credential must never enter the
        // persisted audit record.

        const serializedEvent =
          JSON.stringify(
            auditEvent,
          );

        assert.equal(
          serializedEvent.includes(
            verificationToken.token,
          ),
          false,
        );
      },
    );
  },
);

//************************************************************** */