import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import express from "express";

import request from "supertest";

import {
  errorHandler,
} from "../../../src/middleware/error-handler.js";

import {
  createRateLimitMiddleware,
} from "../../../src/platform/security/rate-limit/rate-limit.middleware.js";

import {
  InMemoryRateLimitStore,
} from "../../../src/platform/security/rate-limit/rate-limit.store.js";

//************************************************************** */

describe(
  "Rate limit security integration",
  () => {
    it(
      "allows requests through the configured limit",
      async () => {
        const store =
          new InMemoryRateLimitStore();

        const app =
          express();

        app.use(
          createRateLimitMiddleware({
            name:
              "test-limit",

            limit:
              2,

            windowMilliseconds:
              60_000,

            store,
          }),
        );

        app.get(
          "/test",
          (_request, response) => {
            response
              .status(200)
              .json({
                success: true,
              });
          },
        );

        app.use(
          errorHandler,
        );

        const firstResponse =
          await request(app)
            .get(
              "/test",
            );

        const secondResponse =
          await request(app)
            .get(
              "/test",
            );

        assert.equal(
          firstResponse.status,
          200,
        );

        assert.equal(
          secondResponse.status,
          200,
        );

        assert.equal(
          secondResponse.headers[
            "ratelimit-limit"
          ],
          "2",
        );

        assert.equal(
          secondResponse.headers[
            "ratelimit-remaining"
          ],
          "0",
        );
      },
    );

    //************************************************************** */

    it(
      "returns 429 after the configured limit is exceeded",
      async () => {
        const store =
          new InMemoryRateLimitStore();

        const app =
          express();

        app.use(
          createRateLimitMiddleware({
            name:
              "test-limit",

            limit:
              2,

            windowMilliseconds:
              60_000,

            store,
          }),
        );

        app.get(
          "/test",
          (_request, response) => {
            response
              .status(200)
              .json({
                success: true,
              });
          },
        );

        app.use(
          errorHandler,
        );

        await request(app)
          .get(
            "/test",
          );

        await request(app)
          .get(
            "/test",
          );

        const blockedResponse =
          await request(app)
            .get(
              "/test",
            );

        assert.equal(
          blockedResponse.status,
          429,
        );

        assert.equal(
          blockedResponse.body?.code,
          "RATE_LIMIT_EXCEEDED",
        );

        assert.equal(
          blockedResponse.body?.message,
          "Too many requests. Please try again later.",
        );

        assert.ok(
          blockedResponse.headers[
            "retry-after"
          ],
        );

        assert.equal(
          blockedResponse.headers[
            "ratelimit-remaining"
          ],
          "0",
        );
      },
    );

    //************************************************************** */

    it(
      "keeps different rate-limit namespaces isolated",
      async () => {
        const store =
          new InMemoryRateLimitStore();

        const firstLimiter =
          createRateLimitMiddleware({
            name:
              "first-policy",

            limit:
              1,

            windowMilliseconds:
              60_000,

            store,
          });

        const secondLimiter =
          createRateLimitMiddleware({
            name:
              "second-policy",

            limit:
              1,

            windowMilliseconds:
              60_000,

            store,
          });

        const app =
          express();

        app.get(
          "/first",
          firstLimiter,
          (_request, response) => {
            response
              .status(200)
              .json({
                success: true,
              });
          },
        );

        app.get(
          "/second",
          secondLimiter,
          (_request, response) => {
            response
              .status(200)
              .json({
                success: true,
              });
          },
        );

        app.use(
          errorHandler,
        );

        const firstResponse =
          await request(app)
            .get(
              "/first",
            );

        const secondResponse =
          await request(app)
            .get(
              "/second",
            );

        assert.equal(
          firstResponse.status,
          200,
        );

        assert.equal(
          secondResponse.status,
          200,
        );
      },
    );

    //************************************************************** */

    it(
      "keeps custom rate-limit identifiers isolated",
      async () => {
        const store =
          new InMemoryRateLimitStore();

        const app =
          express();

        app.use(
          express.json(),
        );

        app.use(
          createRateLimitMiddleware({
            name:
              "email-policy",

            limit:
              1,

            windowMilliseconds:
              60_000,

            store,

            keyGenerator:
              (request) =>
                String(
                  request.body?.email ??
                    "unknown",
                )
                  .trim()
                  .toLowerCase(),
          }),
        );

        app.post(
          "/test",
          (_request, response) => {
            response
              .status(200)
              .json({
                success: true,
              });
          },
        );

        app.use(
          errorHandler,
        );

        const firstUser =
          await request(app)
            .post(
              "/test",
            )
            .send({
              email:
                "first@motodesk.test",
            });

        const secondUser =
          await request(app)
            .post(
              "/test",
            )
            .send({
              email:
                "second@motodesk.test",
            });

        const blockedFirstUser =
          await request(app)
            .post(
              "/test",
            )
            .send({
              email:
                "FIRST@motodesk.test",
            });

        assert.equal(
          firstUser.status,
          200,
        );

        assert.equal(
          secondUser.status,
          200,
        );

        assert.equal(
          blockedFirstUser.status,
          429,
        );

        assert.equal(
          blockedFirstUser.body?.code,
          "RATE_LIMIT_EXCEEDED",
        );
      },
    );
  },
);

//************************************************************** */