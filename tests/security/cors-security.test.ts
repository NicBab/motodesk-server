import assert from "node:assert/strict";

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

//************************************************************** */

const TRUSTED_ORIGIN =
  env.CLIENT_URL;

const FOREIGN_ORIGIN =
  "https://attacker.example";

//************************************************************** */

describe(
  "CORS security",
  () => {
    it(
      "allows the configured client origin with credentials",
      async () => {
        const response =
          await request(app)
            .get("/")
            .set(
              "Origin",
              TRUSTED_ORIGIN,
            );

        assert.equal(
          response.status,
          200,
        );

        assert.equal(
          response.headers[
            "access-control-allow-origin"
          ],
          TRUSTED_ORIGIN,
        );

        assert.equal(
          response.headers[
            "access-control-allow-credentials"
          ],
          "true",
        );

        assert.equal(
          response.headers.vary
            ?.toLowerCase()
            .includes(
              "origin",
            ),
          true,
        );
      },
    );

    //************************************************************** */

    it(
      "does not grant a foreign origin access to responses",
      async () => {
        const response =
          await request(app)
            .get("/")
            .set(
              "Origin",
              FOREIGN_ORIGIN,
            );

        assert.equal(
          response.status,
          200,
        );

        assert.equal(
          response.headers[
            "access-control-allow-origin"
          ],
          undefined,
        );

        assert.equal(
          response.headers[
            "access-control-allow-credentials"
          ],
          undefined,
        );
      },
    );

    //************************************************************** */

    it(
      "does not grant the null origin access to responses",
      async () => {
        const response =
          await request(app)
            .get("/")
            .set(
              "Origin",
              "null",
            );

        assert.equal(
          response.status,
          200,
        );

        assert.equal(
          response.headers[
            "access-control-allow-origin"
          ],
          undefined,
        );

        assert.equal(
          response.headers[
            "access-control-allow-credentials"
          ],
          undefined,
        );
      },
    );

    //************************************************************** */

    it(
      "allows trusted-origin credentialed preflight requests",
      async () => {
        const response =
          await request(app)
            .options(
              "/api/v1/auth/me",
            )
            .set(
              "Origin",
              TRUSTED_ORIGIN,
            )
            .set(
              "Access-Control-Request-Method",
              "GET",
            )
            .set(
              "Access-Control-Request-Headers",
              "Content-Type",
            );

        assert.equal(
          response.status,
          204,
        );

        assert.equal(
          response.headers[
            "access-control-allow-origin"
          ],
          TRUSTED_ORIGIN,
        );

        assert.equal(
          response.headers[
            "access-control-allow-credentials"
          ],
          "true",
        );

        const allowedMethods =
          response.headers[
            "access-control-allow-methods"
          ];

        assert.equal(
          typeof allowedMethods,
          "string",
        );

        assert.equal(
          allowedMethods
            .split(",")
            .map(
              (method) =>
                method.trim(),
            )
            .includes(
              "GET",
            ),
          true,
        );
      },
    );

    //************************************************************** */

    it(
      "does not grant foreign-origin preflight requests CORS access",
      async () => {
        const response =
          await request(app)
            .options(
              "/api/v1/auth/me",
            )
            .set(
              "Origin",
              FOREIGN_ORIGIN,
            )
            .set(
              "Access-Control-Request-Method",
              "GET",
            )
            .set(
              "Access-Control-Request-Headers",
              "Content-Type",
            );

        assert.equal(
          response.headers[
            "access-control-allow-origin"
          ],
          undefined,
        );

        assert.equal(
          response.headers[
            "access-control-allow-credentials"
          ],
          undefined,
        );
      },
    );

    //************************************************************** */

    it(
      "does not use a wildcard origin with credentialed CORS",
      async () => {
        const response =
          await request(app)
            .get("/")
            .set(
              "Origin",
              TRUSTED_ORIGIN,
            );

        assert.notEqual(
          response.headers[
            "access-control-allow-origin"
          ],
          "*",
        );

        assert.equal(
          response.headers[
            "access-control-allow-origin"
          ],
          TRUSTED_ORIGIN,
        );
      },
    );

    //************************************************************** */

    it(
      "does not allow unapproved request headers during preflight",
      async () => {
        const response =
          await request(app)
            .options(
              "/api/v1/auth/me",
            )
            .set(
              "Origin",
              TRUSTED_ORIGIN,
            )
            .set(
              "Access-Control-Request-Method",
              "GET",
            )
            .set(
              "Access-Control-Request-Headers",
              "X-Untrusted-Header",
            );

        const allowedHeaders =
          response.headers[
            "access-control-allow-headers"
          ];

        assert.equal(
          typeof allowedHeaders,
          "string",
        );

        assert.equal(
          allowedHeaders
            .toLowerCase()
            .split(",")
            .map(
              (header) =>
                header.trim(),
            )
            .includes(
              "x-untrusted-header",
            ),
          false,
        );
      },
    );

    //************************************************************** */

    it(
      "continues to support requests without an Origin header",
      async () => {
        const response =
          await request(app)
            .get("/");

        assert.equal(
          response.status,
          200,
        );

        assert.equal(
          response.headers[
            "access-control-allow-origin"
          ],
          undefined,
        );
      },
    );
  },
);

//************************************************************** */