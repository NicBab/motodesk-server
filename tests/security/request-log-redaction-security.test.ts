import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import type {
  NextFunction,
  Request,
  Response,
} from "express";

import request from "supertest";

import {
  app,
} from "../../src/app.js";

import {
  logger,
} from "../../src/config/logger.js";

import {
  errorHandler,
} from "../../src/middleware/error-handler.js";

//************************************************************** */

describe(
  "Request logging and URL redaction security",
  () => {
    it(
      "does not reflect query-string secrets in unknown-route responses",
      async () => {
        const secret =
          "SUPER_SECRET_QUERY_TOKEN_2026";

        const response =
          await request(app)
            .get(
              `/api/v1/not-a-real-route?token=${secret}&code=${secret}`,
            );

        assert.equal(
          response.status,
          404,
        );

        const serialized =
          JSON.stringify(
            response.body,
          );

        assert.equal(
          serialized.includes(
            secret,
          ),
          false,
        );

        assert.equal(
          serialized.includes(
            "?token=",
          ),
          false,
        );
      },
    );

    //************************************************************** */

    it(
      "does not place query-string secrets into unexpected-error log context",
      () => {
        const secret =
          "SUPER_SECRET_LOG_TOKEN_2026";

        const capturedContexts: Array<
          Record<string, unknown> | undefined
        > = [];

        const originalError =
          logger.error;

        logger.error =
          (
            _message,
            context,
          ): void => {
            capturedContexts.push(
              context,
            );
          };

        try {
          //************************************************************** */
          // This intentionally uses a minimal Express request double.
          //
          // The error handler only needs the request properties below.
          // Casting keeps the test focused on the middleware contract
          // instead of mocking the entire Express Request interface.

          const requestObject = {
            method:
              "GET",

            originalUrl:
              `/api/v1/failure?token=${secret}`,

            path:
              "/api/v1/failure",

            ip:
              "127.0.0.1",

            socket: {
              remoteAddress:
                "127.0.0.1",
            },
          } as unknown as Request;

          const responseObject = {
            getHeader(
              name: string,
            ) {
              if (
                name.toLowerCase() ===
                "x-request-id"
              ) {
                return "request-log-security-test";
              }

              return undefined;
            },

            status() {
              return this;
            },

            json() {
              return this;
            },
          } as unknown as Response;

          const nextFunction =
            (() => undefined) as NextFunction;

          errorHandler(
            new Error(
              "Synthetic unexpected failure",
            ),

            requestObject,

            responseObject,

            nextFunction,
          );
        } finally {
          logger.error =
            originalError;
        }

        //************************************************************** */

        assert.equal(
          capturedContexts.length,
          1,
        );

        const context =
          capturedContexts[0];

        assert.ok(
          context,
        );

        const serialized =
          JSON.stringify(
            context,
          );

        assert.equal(
          serialized.includes(
            secret,
          ),
          false,
        );

        assert.equal(
          serialized.includes(
            "?token=",
          ),
          false,
        );

        assert.equal(
          context.path,
          "/api/v1/failure",
        );
      },
    );
  },
);

//************************************************************** */