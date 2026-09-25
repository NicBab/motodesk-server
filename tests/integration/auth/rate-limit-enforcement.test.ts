import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import request from "supertest";

import {
  app,
} from "../../../src/app.js";

import {
  env,
} from "../../../src/config/env.js";

//************************************************************** */

describe(
  "Auth rate limit enforcement integration",
  () => {
    it(
      "rate limits repeated login attempts for the same identity",
      async () => {
        const email =
          `rate-limit-${Date.now()}@motodesk.test`;

        for (
          let attempt = 1;
          attempt <= 10;
          attempt += 1
        ) {
          const response =
            await request(app)
              .post(
                "/api/v1/auth/login",
              )
              .set(
                "Origin",
                env.CLIENT_URL,
              )
              .send({
                email,

                password:
                  "InvalidPassword123!",
              });

          assert.notEqual(
            response.status,
            429,
          );

          assert.notEqual(
            response.body?.code,
            "RATE_LIMIT_EXCEEDED",
          );
        }

        const blockedResponse =
          await request(app)
            .post(
              "/api/v1/auth/login",
            )
            .set(
              "Origin",
              env.CLIENT_URL,
            )
            .send({
              email,

              password:
                "InvalidPassword123!",
            });

        assert.equal(
          blockedResponse.status,
          429,
        );

        assert.equal(
          blockedResponse.body?.code,
          "RATE_LIMIT_EXCEEDED",
        );

        assert.equal(
          blockedResponse.headers[
            "ratelimit-limit"
          ],
          "10",
        );

        assert.equal(
          blockedResponse.headers[
            "ratelimit-remaining"
          ],
          "0",
        );

        assert.ok(
          blockedResponse.headers[
            "retry-after"
          ],
        );
      },
    );
  },
);

//************************************************************** */