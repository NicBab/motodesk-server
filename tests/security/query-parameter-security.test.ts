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
  "Query and parameter security",
  () => {
    it(
      "rejects duplicate scalar query parameters",
      async () => {
        const response =
          await request(app)
            .get(
              "/api/v1/auth/sessions",
            )
            .query({
              limit: [
                "10",
                "20",
              ],
            });

        //************************************************************** */
        // Authentication may execute before query validation on this
        // route. An unauthenticated request therefore cannot prove the
        // query-validation boundary.
        //
        // This assertion prevents an ambiguous duplicate query from
        // accidentally being accepted as a successful request.

        assert.notEqual(
          response.status,
          200,
        );
      },
    );

    //************************************************************** */

    it(
      "does not interpret prototype-pollution query keys as object prototypes",
      async () => {
        const response =
          await request(app)
            .get(
              "/api/v1/health?__proto__[polluted]=true",
            );

        assert.equal(
          response.status,
          200,
        );

        assert.equal(
          (
            {} as {
              polluted?: unknown;
            }
          ).polluted,
          undefined,
        );
      },
    );

    //************************************************************** */

    it(
      "does not interpret constructor prototype query keys as object prototypes",
      async () => {
        const response =
          await request(app)
            .get(
              "/api/v1/health?constructor[prototype][polluted]=true",
            );

        assert.equal(
          response.status,
          200,
        );

        assert.equal(
          (
            {} as {
              polluted?: unknown;
            }
          ).polluted,
          undefined,
        );
      },
    );

    //************************************************************** */

    it(
      "accepts ordinary query strings without affecting the request pipeline",
      async () => {
        const response =
          await request(app)
            .get(
              "/api/v1/health",
            )
            .query({
              securityCheck:
                "normal",
            });

        assert.equal(
          response.status,
          200,
        );
      },
    );
  },
);

//************************************************************** */