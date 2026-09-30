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
  env,
} from "../../src/config/env.js";

import {
  errorHandler,
} from "../../src/middleware/error-handler.js";

import type {
  NextFunction,
  Request,
  Response,
} from "express";

//************************************************************** */

function getSetCookieHeaders(
  response:
    request.Response,
): string[] {
  const setCookie =
    response.headers[
      "set-cookie"
    ];

  if (
    !setCookie
  ) {
    return [];
  }

  return Array.isArray(
    setCookie,
  )
    ? setCookie
    : [
        setCookie,
      ];
}

//************************************************************** */

function findCookie(
  cookies: string[],
  name: string,
): string {
  const cookie =
    cookies.find(
      (value) =>
        value.startsWith(
          `${name}=`,
        ),
    );

  assert.ok(
    cookie,
    `Expected ${name} cookie to be present.`,
  );

  return cookie;
}

//************************************************************** */

async function registerUser() {
  const suffix =
    randomUUID();

  const email =
    `cookie-security-${suffix}@motodesk.local`;

  const password =
    "MotoDesk-Security-Test-2026!";

  const response =
    await request(app)
      .post(
        "/api/v1/auth/register",
      )
      .send({
        email,

        password,

        firstName:
          "Cookie",

        lastName:
          "Security",

        organizationName:
          `Cookie Security ${suffix}`,
      });

  assert.equal(
    response.status,
    201,
  );

  return {
    email,
    password,
    response,
  };
}

//************************************************************** */

function createMockResponse() {
  let statusCode =
    200;

  let body:
    unknown;

  const headers =
    new Map<
      string,
      unknown
    >();

  const response = {
    status(
      value: number,
    ) {
      statusCode =
        value;

      return response;
    },

    json(
      value: unknown,
    ) {
      body =
        value;

      return response;
    },

    getHeader(
      name: string,
    ) {
      return headers.get(
        name.toLowerCase(),
      );
    },

    setHeader(
      name: string,
      value: unknown,
    ) {
      headers.set(
        name.toLowerCase(),
        value,
      );

      return response;
    },
  };

  return {
    response:
      response as unknown as Response,

    getStatusCode:
      () =>
        statusCode,

    getBody:
      () =>
        body,
  };
}

//************************************************************** */

function createMockRequest():
  Request {
  return {
    method:
      "GET",

    originalUrl:
      "/security-test",

    ip:
      "127.0.0.1",

    socket: {
      remoteAddress:
        "127.0.0.1",
    },
  } as Request;
}

//************************************************************** */

describe(
  "Authentication cookie and error disclosure security",
  () => {
    it(
      "sets HttpOnly authentication cookies",
      async () => {
        const {
          response,
        } =
          await registerUser();

        const cookies =
          getSetCookieHeaders(
            response,
          );

        const accessCookie =
          findCookie(
            cookies,
            "motodesk_access_token",
          );

        const refreshCookie =
          findCookie(
            cookies,
            "motodesk_refresh_token",
          );

        assert.equal(
          accessCookie.includes(
            "HttpOnly",
          ),
          true,
        );

        assert.equal(
          refreshCookie.includes(
            "HttpOnly",
          ),
          true,
        );
      },
    );

    //************************************************************** */

    it(
      "applies the configured SameSite policy to authentication cookies",
      async () => {
        const {
          response,
        } =
          await registerUser();

        const cookies =
          getSetCookieHeaders(
            response,
          );

        const expectedSameSite =
          `SameSite=${
            env.COOKIE_SAME_SITE
              .charAt(0)
              .toUpperCase()
          }${
            env.COOKIE_SAME_SITE.slice(
              1,
            )
          }`;

        const accessCookie =
          findCookie(
            cookies,
            "motodesk_access_token",
          );

        const refreshCookie =
          findCookie(
            cookies,
            "motodesk_refresh_token",
          );

        assert.equal(
          accessCookie.includes(
            expectedSameSite,
          ),
          true,
        );

        assert.equal(
          refreshCookie.includes(
            expectedSameSite,
          ),
          true,
        );
      },
    );

    //************************************************************** */

    it(
      "applies Secure to authentication cookies when configured",
      async () => {
        const {
          response,
        } =
          await registerUser();

        const cookies =
          getSetCookieHeaders(
            response,
          );

        const accessCookie =
          findCookie(
            cookies,
            "motodesk_access_token",
          );

        const refreshCookie =
          findCookie(
            cookies,
            "motodesk_refresh_token",
          );

        assert.equal(
          accessCookie.includes(
            "Secure",
          ),
          env.COOKIE_SECURE,
        );

        assert.equal(
          refreshCookie.includes(
            "Secure",
          ),
          env.COOKIE_SECURE,
        );
      },
    );

    //************************************************************** */

    it(
      "does not expose raw authentication tokens in the registration response body",
      async () => {
        const {
          response,
        } =
          await registerUser();

        assert.equal(
          response.body.success,
          true,
        );

        const data =
          response.body.data;

        assert.ok(
          data,
        );

        //************************************************************** */
        // Expiration timestamps are intentionally returned to the client.
        // Raw bearer/refresh credentials must not be.

        assert.equal(
          Object.prototype.hasOwnProperty.call(
            data,
            "accessToken",
          ),
          false,
        );

        assert.equal(
          Object.prototype.hasOwnProperty.call(
            data,
            "refreshToken",
          ),
          false,
        );

        assert.equal(
          typeof data.accessTokenExpiresAt,
          "string",
        );

        assert.equal(
          typeof data.refreshTokenExpiresAt,
          "string",
        );
      },
    );

    //************************************************************** */

    it(
      "does not expose internal error details or stack traces in production",
      () => {
        const originalNodeEnvironment =
          env.NODE_ENV;

        (
          env as {
            NODE_ENV:
              "development" |
              "test" |
              "production";
          }
        ).NODE_ENV =
          "production";

        try {
          const {
            response,
            getStatusCode,
            getBody,
          } =
            createMockResponse();

          const error =
            new Error(
              "Highly sensitive internal failure detail.",
            );

          error.stack =
            "SECRET_INTERNAL_STACK_TRACE";

          errorHandler(
            error,
            createMockRequest(),
            response,
            (() => {}) as NextFunction,
          );

          assert.equal(
            getStatusCode(),
            500,
          );

          const body =
            getBody() as {
              success?: boolean;
              message?: string;
              error?: string;
              stack?: string;
            };

          assert.equal(
            body.success,
            false,
          );

          assert.equal(
            body.message,
            "An unexpected server error occurred.",
          );

          assert.equal(
            body.error,
            undefined,
          );

          assert.equal(
            body.stack,
            undefined,
          );

          const serializedBody =
            JSON.stringify(
              body,
            );

          assert.equal(
            serializedBody.includes(
              "Highly sensitive internal failure detail.",
            ),
            false,
          );

          assert.equal(
            serializedBody.includes(
              "SECRET_INTERNAL_STACK_TRACE",
            ),
            false,
          );
        } finally {
          (
            env as {
              NODE_ENV:
                "development" |
                "test" |
                "production";
            }
          ).NODE_ENV =
            originalNodeEnvironment;
        }
      },
    );

    //************************************************************** */

    it(
      "exposes development diagnostics only in development mode",
      () => {
        const originalNodeEnvironment =
          env.NODE_ENV;

        (
          env as {
            NODE_ENV:
              "development" |
              "test" |
              "production";
          }
        ).NODE_ENV =
          "development";

        try {
          const {
            response,
            getStatusCode,
            getBody,
          } =
            createMockResponse();

          const error =
            new Error(
              "Development diagnostic detail.",
            );

          error.stack =
            "DEVELOPMENT_STACK_TRACE";

          errorHandler(
            error,
            createMockRequest(),
            response,
            (() => {}) as NextFunction,
          );

          assert.equal(
            getStatusCode(),
            500,
          );

          const body =
            getBody() as {
              success?: boolean;
              message?: string;
              error?: string;
              stack?: string;
            };

          assert.equal(
            body.success,
            false,
          );

          assert.equal(
            body.message,
            "An unexpected server error occurred.",
          );

          assert.equal(
            body.error,
            "Development diagnostic detail.",
          );

          assert.equal(
            body.stack,
            "DEVELOPMENT_STACK_TRACE",
          );
        } finally {
          (
            env as {
              NODE_ENV:
                "development" |
                "test" |
                "production";
            }
          ).NODE_ENV =
            originalNodeEnvironment;
        }
      },
    );
  },
);

//************************************************************** */