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

        //************************************************************** */
        // Create

        const createResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .send({
              type: "INDIVIDUAL",
              firstName:
                "Integration",
              lastName:
                "Customer",
              email:
                "integration.customer@motodesk.local",
              phone:
                "3375551000",
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

        //************************************************************** */
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
          getResponse.body.success,
          true,
        );

        assert.equal(
          getResponse.body.data.id,
          customerId,
        );

        //************************************************************** */
        // Update

        const updateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/customers/${customerId}`,
            )
            .send({
              phone:
                "3375552000",
              notes:
                "Integration test update.",
            });

        assert.equal(
          updateResponse.status,
          200,
        );

        assert.equal(
          updateResponse.body.success,
          true,
        );

        assert.equal(
          updateResponse.body.data.phone,
          "3375552000",
        );

        assert.equal(
          updateResponse.body.data.notes,
          "Integration test update.",
        );

        //************************************************************** */
        // List + Search

        const listResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .query({
              search:
                "Integration",
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

    //************************************************************** */

    it(
      "filters customers by type and active status",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const businessResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .send({
              type: "BUSINESS",
              companyName:
                "Integration Motors",
              email:
                "integration.motors@motodesk.local",
            });

        assert.equal(
          businessResponse.status,
          201,
        );

        assert.equal(
          businessResponse.body.success,
          true,
        );

        const listResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .query({
              type: "BUSINESS",
              isActive: "true",
            });

        assert.equal(
          listResponse.status,
          200,
        );

        assert.equal(
          listResponse.body.success,
          true,
        );

        const allCustomersMatch =
          listResponse.body.data.every(
            (
              customer: {
                type: string;
                isActive: boolean;
              },
            ) =>
              customer.type ===
                "BUSINESS" &&
              customer.isActive ===
                true,
          );

        assert.equal(
          allCustomersMatch,
          true,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects an invalid business transition",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const createResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .send({
              type: "INDIVIDUAL",
              firstName:
                "Transition",
              lastName:
                "Customer",
            });

        assert.equal(
          createResponse.status,
          201,
        );

        const customerId =
          createResponse.body.data.id;

        const updateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/customers/${customerId}`,
            )
            .send({
              type: "BUSINESS",
            });

        assert.equal(
          updateResponse.status,
          400,
        );

        assert.equal(
          updateResponse.body.success,
          false,
        );

        assert.equal(
          updateResponse.body.code,
          "CUSTOMER_COMPANY_NAME_REQUIRED",
        );

        const getResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/customers/${customerId}`,
          );

        assert.equal(
          getResponse.status,
          200,
        );

        assert.equal(
          getResponse.body.data.type,
          "INDIVIDUAL",
        );
      },
    );

    //************************************************************** */

    it(
      "archives a customer and rejects a second archive",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const createResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .send({
              type: "INDIVIDUAL",
              firstName:
                "Archive",
              lastName:
                "Customer",
            });

        assert.equal(
          createResponse.status,
          201,
        );

        const customerId =
          createResponse.body.data.id;

        const archiveResponse =
          await agent.post(
            `/api/v1/organizations/${organizationId}/customers/${customerId}/archive`,
          );

        assert.equal(
          archiveResponse.status,
          200,
        );

        assert.equal(
          archiveResponse.body.success,
          true,
        );

        assert.equal(
          archiveResponse.body.data.isActive,
          false,
        );

        const secondArchiveResponse =
          await agent.post(
            `/api/v1/organizations/${organizationId}/customers/${customerId}/archive`,
          );

        assert.equal(
          secondArchiveResponse.status,
          400,
        );

        assert.equal(
          secondArchiveResponse.body.success,
          false,
        );

        assert.equal(
          secondArchiveResponse.body.code,
          "CUSTOMER_ALREADY_ARCHIVED",
        );
      },
    );
  },
);