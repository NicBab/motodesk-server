import assert from "node:assert/strict";
import {
  describe,
  it,
} from "node:test";

import request from "supertest";

import {
  app,
} from "../../src/app.js";

//************************************************************** */

describe(
  "Operational API hardening security",
  () => {
    it(
      "does not disclose the Express implementation header",
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
      "applies baseline browser security headers",
      async () => {
        const response =
          await request(app)
            .get("/");

        assert.equal(
          typeof response.headers[
            "x-content-type-options"
          ],
          "string",
        );

        assert.equal(
          response.headers[
            "x-content-type-options"
          ],
          "nosniff",
        );

        assert.equal(
          typeof response.headers[
            "x-frame-options"
          ],
          "string",
        );

        assert.equal(
          typeof response.headers[
            "content-security-policy"
          ],
          "string",
        );
      },
    );

    //************************************************************** */

    it(
      "returns a controlled response for an unknown API route",
      async () => {
        const response =
          await request(app)
            .get(
              "/api/v1/this-route-does-not-exist",
            );

        assert.equal(
          response.status,
          404,
        );

        assert.equal(
          response.body.success,
          false,
        );

        assert.equal(
          response.body.code,
          "ROUTE_NOT_FOUND",
        );

        const serialized =
          JSON.stringify(
            response.body,
          );

        assert.equal(
          serialized.includes(
            "node_modules",
          ),
          false,
        );

        assert.equal(
          serialized.includes(
            "prisma",
          ),
          false,
        );

        assert.equal(
          serialized.includes(
            "stack",
          ),
          false,
        );
      },
    );

    //************************************************************** */

    it(
      "does not expose database details through the healthy health endpoint",
      async () => {
        const response =
          await request(app)
            .get(
              "/api/v1/health",
            );

        assert.equal(
          response.status,
          200,
        );

        assert.equal(
          response.body.success,
          true,
        );

        assert.equal(
          response.body.status,
          "healthy",
        );

        const serialized =
          JSON.stringify(
            response.body,
          )
            .toLowerCase();

        assert.equal(
          serialized.includes(
            "postgres",
          ),
          false,
        );

        assert.equal(
          serialized.includes(
            "database_url",
          ),
          false,
        );

        assert.equal(
          serialized.includes(
            "password",
          ),
          false,
        );

        assert.equal(
          serialized.includes(
            "localhost",
          ),
          false,
        );
      },
    );

    //************************************************************** */

    it(
      "does not treat unsupported methods as successful API operations",
      async () => {
        const response =
          await request(app)
            .trace(
              "/api/v1/health",
            );

        assert.equal(
          response.status >= 400,
          true,
        );

        assert.equal(
          response.status < 500,
          true,
        );
      },
    );
  },
);

//************************************************************** */