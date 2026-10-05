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
  "Request logger security",
  () => {
    it(
      "continues serving requests containing query parameters without reflecting them in API responses",
      async () => {
        const secret =
          "REQUEST_LOGGER_SECRET_2026";

        const response =
          await request(app)
            .get(
              `/api/v1/health?token=${secret}`,
            );

        assert.equal(
          response.status,
          200,
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
      },
    );

    //************************************************************** */

    it(
      "continues to expose the normal health response after hardened request logging",
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
      },
    );
  },
);

//************************************************************** */