import assert from "node:assert/strict";

import {
  after,
  before,
  describe,
  it,
} from "node:test";

import request from "supertest";

import {
  AuthTokenType,
} from "../../../src/generated/prisma/client.js";

import {
  app,
} from "../../../src/app.js";

import {
  prisma,
} from "../../../src/config/prisma.js";

import {
  hashPassword,
} from "../../../src/modules/auth/security/password.service.js";

import {
  createPasswordResetAuthToken,
} from "../../../src/modules/auth/tokens/one-time-token.service.js";

//************************************************************** */

const TEST_EMAIL =
  `password.reset.${Date.now()}@motodesk.test`;

const ORIGINAL_PASSWORD =
  "MotoDeskOriginal123!";

const NEW_PASSWORD =
  "MotoDeskReset123!";

let testUserId =
  "";

//************************************************************** */

before(async () => {
  const passwordHash =
    await hashPassword(
      ORIGINAL_PASSWORD,
    );

  const user =
    await prisma.user.create({
      data: {
        email:
          TEST_EMAIL,

        passwordHash,

        firstName:
          "Password",

        lastName:
          "Reset",

        isActive:
          true,

        emailVerifiedAt:
          new Date(),
      },

      select: {
        id: true,
      },
    });

  testUserId =
    user.id;
});

//************************************************************** */

after(async () => {
  if (!testUserId) {
    return;
  }

  await prisma.session.deleteMany({
    where: {
      userId:
        testUserId,
    },
  });

  await prisma.authToken.deleteMany({
    where: {
      userId:
        testUserId,
    },
  });

  await prisma.auditLog.deleteMany({
    where: {
      actorUserId:
        testUserId,
    },
  });

  await prisma.user.delete({
    where: {
      id:
        testUserId,
    },
  });
});

//************************************************************** */

describe(
  "Password reset hardening integration",
  () => {
    it(
      "changes the password, consumes the token, and revokes all existing sessions",
      async () => {
        const firstAgent =
          request.agent(
            app,
          );

        const secondAgent =
          request.agent(
            app,
          );

        //************************************************************** */
        // Establish two independent authenticated sessions.

        const firstLoginResponse =
          await firstAgent
            .post(
              "/api/v1/auth/login",
            )
            .send({
              email:
                TEST_EMAIL,

              password:
                ORIGINAL_PASSWORD,
            });

        assert.equal(
          firstLoginResponse.status,
          200,
        );

        const secondLoginResponse =
          await secondAgent
            .post(
              "/api/v1/auth/login",
            )
            .send({
              email:
                TEST_EMAIL,

              password:
                ORIGINAL_PASSWORD,
            });

        assert.equal(
          secondLoginResponse.status,
          200,
        );

        //************************************************************** */
        // Create a real production-format reset token without sending
        // transactional email.

        const resetToken =
          await createPasswordResetAuthToken(
            testUserId,
          );

        //************************************************************** */
        // Exercise the real HTTP password-reset endpoint.

        const resetResponse =
          await request(app)
            .post(
              "/api/v1/auth/reset-password",
            )
            .send({
              token:
                resetToken.token,

              password:
                NEW_PASSWORD,

              confirmPassword:
                NEW_PASSWORD,
            });

        assert.equal(
          resetResponse.status,
          200,
        );

        assert.equal(
          resetResponse.body?.success,
          true,
        );

        //************************************************************** */
        // The same reset token must never work twice.

        const reusedTokenResponse =
          await request(app)
            .post(
              "/api/v1/auth/reset-password",
            )
            .send({
              token:
                resetToken.token,

              password:
                "MotoDeskAnother123!",

              confirmPassword:
                "MotoDeskAnother123!",
            });

        assert.equal(
          reusedTokenResponse.status,
          400,
        );

        //************************************************************** */
        // Both sessions created before the reset must be revoked.

        const firstSessionResponse =
          await firstAgent.get(
            "/api/v1/auth/me",
          );

        assert.equal(
          firstSessionResponse.status,
          401,
        );

        const secondSessionResponse =
          await secondAgent.get(
            "/api/v1/auth/me",
          );

        assert.equal(
          secondSessionResponse.status,
          401,
        );

        //************************************************************** */
        // The old password must no longer authenticate.

        const oldPasswordResponse =
          await request(app)
            .post(
              "/api/v1/auth/login",
            )
            .send({
              email:
                TEST_EMAIL,

              password:
                ORIGINAL_PASSWORD,
            });

        assert.equal(
          oldPasswordResponse.status,
          401,
        );

        //************************************************************** */
        // The replacement password must authenticate normally.

        const newPasswordResponse =
          await request(app)
            .post(
              "/api/v1/auth/login",
            )
            .send({
              email:
                TEST_EMAIL,

              password:
                NEW_PASSWORD,
            });

        assert.equal(
          newPasswordResponse.status,
          200,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects an expired password-reset token",
      async () => {
        const resetToken =
          await createPasswordResetAuthToken(
            testUserId,
          );

        //************************************************************** */
        // Creation invalidates previous unused PASSWORD_RESET tokens,
        // so expire the current unused token for this test user.

        await prisma.authToken.updateMany({
          where: {
            userId:
              testUserId,

            type:
              AuthTokenType.PASSWORD_RESET,

            usedAt:
              null,
          },

          data: {
            expiresAt:
              new Date(
                Date.now() -
                  60_000,
              ),
          },
        });

        const response =
          await request(app)
            .post(
              "/api/v1/auth/reset-password",
            )
            .send({
              token:
                resetToken.token,

              password:
                "MotoDeskExpired123!",

              confirmPassword:
                "MotoDeskExpired123!",
            });

        assert.equal(
          response.status,
          400,
        );
      },
    );
  },
);

//************************************************************** */