import assert from "node:assert/strict";
import {
  describe,
  it,
} from "node:test";

import {
  createAuthenticatedAgent,
} from "./helpers/authenticated-agent.js";

//************************************************************** */

describe(
  "Customer integration",
  () => {
    it(
      "creates, retrieves, updates, and lists a customer",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        // Create
        const createResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .send({
              type: "INDIVIDUAL",
              firstName: "Integration",
              lastName: "Customer",
              email:
                "integration.customer@motodesk.local",
              phone: "3375551000",
            });

        assert.equal(
          createResponse.status,
          201,
        );

        assert.equal(
          createResponse.body.success,
          true,
        );

        const customerId =
          createResponse.body.data.id;

        assert.equal(
          typeof customerId,
          "string",
        );

        // Get
        const getResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/customers/${customerId}`,
          );

        assert.equal(
          getResponse.status,
          200,
        );

        assert.equal(
          getResponse.body.data.id,
          customerId,
        );

        // Update
        const updateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/customers/${customerId}`,
            )
            .send({
              phone: "3375552000",
              notes:
                "Integration test update.",
            });

        assert.equal(
          updateResponse.status,
          200,
        );

        assert.equal(
          updateResponse.body.data.phone,
          "3375552000",
        );

        // List + search
        const listResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .query({
              search: "Integration",
            });

        assert.equal(
          listResponse.status,
          200,
        );

        assert.equal(
          listResponse.body.success,
          true,
        );

        const customerFound =
          listResponse.body.data.some(
            (
              customer: {
                id: string;
              },
            ) =>
              customer.id ===
              customerId,
          );

        assert.equal(
          customerFound,
          true,
        );
      },
    );
  },
);