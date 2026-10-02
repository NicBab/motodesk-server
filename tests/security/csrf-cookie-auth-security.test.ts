import assert from "node:assert/strict";

import {
  randomUUID,
} from "node:crypto";

import {
  after,
  before,
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

//************************************************************** */

const TRUSTED_ORIGIN =
  "http://localhost:3000";

const FOREIGN_ORIGIN =
  "https://attacker.example";

const suffix =
  randomUUID();

const email =
  `csrf-security-${suffix}@motodesk.local`;

const password =
  "MotoDesk-CSRF-Security-2026!";

let userId: string | null =
  null;

//************************************************************** */

async function createAuthenticatedAgent() {
  const agent =
    request.agent(
      app,
    );

  const loginResponse =
    await agent
      .post(
        "/api/v1/auth/login",
      )
      .set(
        "Origin",
        TRUSTED_ORIGIN,
      )
      .send({
        email,
        password,
      });

  assert.equal(
    loginResponse.status,
    200,
  );

  return agent;
}

//************************************************************** */

describe(
  "CSRF cookie authentication security",
  () => {
    before(
      async () => {
        const registrationAgent =
          request.agent(
            app,
          );

        const registrationResponse =
          await registrationAgent
            .post(
              "/api/v1/auth/register",
            )
            .set(
              "Origin",
              TRUSTED_ORIGIN,
            )
            .send({
              email,

              password,

              firstName:
                "CSRF",

              lastName:
                "Security",

              organization: {
                name:
                  `CSRF Security ${suffix}`,

                slug:
                  `csrf-security-${suffix}`,
              },
            });

        assert.equal(
          registrationResponse.status,
          201,
        );

        const registeredUserId =
          registrationResponse.body
            ?.data
            ?.user
            ?.id;

        assert.equal(
          typeof registeredUserId,
          "string",
        );

        if (
          typeof registeredUserId !== "string"
        ) {
          throw new Error(
            "Registration did not return the expected user identifier.",
          );
        }

        userId =
          registeredUserId;
      },
    );

    //************************************************************** */

    after(
      async () => {
        if (
          !userId
        ) {
          return;
        }

        //************************************************************** */
        // Remove the isolated test account and its related records
        // through the database cleanup behavior already provided by
        // relational cascades.

        await prisma.user.delete({
          where: {
            id:
              userId,
          },
        });
      },
    );

    //************************************************************** */

    it(
      "allows an authenticated mutation from the trusted origin",
      async () => {
        const agent =
          await createAuthenticatedAgent();

        const response =
          await agent
            .post(
              "/api/v1/auth/logout-all",
            )
            .set(
              "Origin",
              TRUSTED_ORIGIN,
            );

        assert.equal(
          response.status,
          200,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects an authenticated cookie-backed mutation from a foreign origin",
      async () => {
        const agent =
          await createAuthenticatedAgent();

        const response =
          await agent
            .post(
              "/api/v1/auth/logout-all",
            )
            .set(
              "Origin",
              FOREIGN_ORIGIN,
            );

        assert.equal(
          response.status,
          403,
        );

        //************************************************************** */
        // Rejected cross-site requests must not consume the valid
        // authenticated session.

        const meResponse =
          await agent
            .get(
              "/api/v1/auth/me",
            )
            .set(
              "Origin",
              TRUSTED_ORIGIN,
            );

        assert.equal(
          meResponse.status,
          200,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects a foreign referer when origin is absent",
      async () => {
        const agent =
          await createAuthenticatedAgent();

        const response =
          await agent
            .post(
              "/api/v1/auth/logout-all",
            )
            .set(
              "Referer",
              `${FOREIGN_ORIGIN}/csrf-attack`,
            );

        assert.equal(
          response.status,
          403,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects a malformed origin on an authenticated mutation",
      async () => {
        const agent =
          await createAuthenticatedAgent();

        const response =
          await agent
            .post(
              "/api/v1/auth/logout-all",
            )
            .set(
              "Origin",
              "not-a-valid-origin",
            );

        assert.equal(
          response.status,
          403,
        );
      },
    );

    //************************************************************** */

    it(
      "does not allow a trusted referer to override a foreign origin",
      async () => {
        const agent =
          await createAuthenticatedAgent();

        const response =
          await agent
            .post(
              "/api/v1/auth/logout-all",
            )
            .set(
              "Origin",
              FOREIGN_ORIGIN,
            )
            .set(
              "Referer",
              `${TRUSTED_ORIGIN}/dashboard`,
            );

        assert.equal(
          response.status,
          403,
        );
      },
    );

    //************************************************************** */

    it(
      "allows the trusted origin when a conflicting foreign referer is also present",
      async () => {
        const agent =
          await createAuthenticatedAgent();

        const response =
          await agent
            .post(
              "/api/v1/auth/logout-all",
            )
            .set(
              "Origin",
              TRUSTED_ORIGIN,
            )
            .set(
              "Referer",
              `${FOREIGN_ORIGIN}/csrf-attack`,
            );

        //************************************************************** */
        // Origin is authoritative when present.
        //
        // Referer is used only as a fallback when Origin is absent.

        assert.equal(
          response.status,
          200,
        );
      },
    );
  },
);

//************************************************************** */