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

//************************************************************** */

describe(
  "Restore route authorization",
  () => {
    it(
      "requires authentication before restoring a customer",
      async () => {
        const response =
          await request(app)
            .post(
              `/api/v1/organizations/${randomUUID()}/customers/${randomUUID()}/restore`,
            );

        assert.equal(
          response.status,
          401,
        );
      },
    );

    //************************************************************** */

    it(
      "requires authentication before restoring a vehicle",
      async () => {
        const response =
          await request(app)
            .post(
              `/api/v1/organizations/${randomUUID()}/vehicles/${randomUUID()}/restore`,
            );

        assert.equal(
          response.status,
          401,
        );
      },
    );

    //************************************************************** */

    it(
      "does not allow an unauthenticated customer restore request to reach resource lookup",
      async () => {
        const organizationId =
          randomUUID();

        const customerId =
          randomUUID();

        const response =
          await request(app)
            .post(
              `/api/v1/organizations/${organizationId}/customers/${customerId}/restore`,
            );

        assert.equal(
          response.status,
          401,
        );

        assert.notEqual(
          response.body.code,
          "CUSTOMER_NOT_FOUND",
        );
      },
    );

    //************************************************************** */

    it(
      "does not allow an unauthenticated vehicle restore request to reach resource lookup",
      async () => {
        const organizationId =
          randomUUID();

        const vehicleId =
          randomUUID();

        const response =
          await request(app)
            .post(
              `/api/v1/organizations/${organizationId}/vehicles/${vehicleId}/restore`,
            );

        assert.equal(
          response.status,
          401,
        );

        assert.notEqual(
          response.body.code,
          "VEHICLE_NOT_FOUND",
        );
      },
    );
  },
);

//************************************************************** */