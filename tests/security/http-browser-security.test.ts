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

describe(
  "HTTP and browser-facing security",
  () => {
    //************************************************************** */

    it(
      "does not expose the Express X-Powered-By header",
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
            "x-powered-by"
          ],
          undefined,
        );
      },
    );

    //************************************************************** */

    it(
      "applies Helmet security headers",
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
            "x-content-type-options"
          ],
          "nosniff",
        );

        assert.equal(
          response.headers[
            "x-frame-options"
          ],
          "SAMEORIGIN",
        );

        assert.equal(
          response.headers[
            "referrer-policy"
          ],
          "no-referrer",
        );

        assert.equal(
          response.headers[
            "cross-origin-opener-policy"
          ],
          "same-origin",
        );

        assert.equal(
          response.headers[
            "cross-origin-resource-policy"
          ],
          "same-origin",
        );
      },
    );

    //************************************************************** */

    it(
      "does not expose the deprecated X-XSS-Protection browser filter",
      async () => {
        const response =
          await request(app)
            .get("/");

        assert.equal(
          response.status,
          200,
        );

        //************************************************************** */
        // Helmet deliberately disables the obsolete browser XSS auditor
        // rather than relying on it as an application security control.

        assert.equal(
          response.headers[
            "x-xss-protection"
          ],
          "0",
        );
      },
    );

    //************************************************************** */

    it(
      "allows the configured client origin through CORS",
      async () => {
        const response =
          await request(app)
            .get("/api/v1/health")
            .set(
              "Origin",
              env.CLIENT_URL,
            );

        assert.equal(
          response.headers[
            "access-control-allow-origin"
          ],
          env.CLIENT_URL,
        );

        assert.equal(
          response.headers[
            "access-control-allow-credentials"
          ],
          "true",
        );
      },
    );

    //************************************************************** */

    it(
      "does not grant CORS access to a foreign origin",
      async () => {
        const response =
          await request(app)
            .get("/api/v1/health")
            .set(
              "Origin",
              "https://attacker.example",
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
      "allows configured CORS preflight requests",
      async () => {
        const response =
          await request(app)
            .options(
              "/api/v1/auth/login",
            )
            .set(
              "Origin",
              env.CLIENT_URL,
            )
            .set(
              "Access-Control-Request-Method",
              "POST",
            )
            .set(
              "Access-Control-Request-Headers",
              "content-type",
            );

        assert.equal(
          response.status,
          204,
        );

        assert.equal(
          response.headers[
            "access-control-allow-origin"
          ],
          env.CLIENT_URL,
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
          allowedMethods.includes(
            "POST",
          ),
          true,
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
            .includes(
              "content-type",
            ),
          true,
        );
      },
    );

    //************************************************************** */

    it(
      "does not grant CORS preflight access to a foreign origin",
      async () => {
        const response =
          await request(app)
            .options(
              "/api/v1/auth/login",
            )
            .set(
              "Origin",
              "https://attacker.example",
            )
            .set(
              "Access-Control-Request-Method",
              "POST",
            )
            .set(
              "Access-Control-Request-Headers",
              "content-type",
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
      "varies CORS responses by Origin",
      async () => {
        const response =
          await request(app)
            .get("/api/v1/health")
            .set(
              "Origin",
              env.CLIENT_URL,
            );

        const varyHeader =
          response.headers.vary;

        assert.equal(
          typeof varyHeader,
          "string",
        );

        assert.equal(
          varyHeader
            .toLowerCase()
            .split(",")
            .map(
              (value) =>
                value.trim(),
            )
            .includes(
              "origin",
            ),
          true,
        );
      },
    );
  },
);

//************************************************************** */