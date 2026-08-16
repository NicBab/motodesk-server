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
  "Repair Order Labor integration",
  () => {
    it(
      "creates, retrieves, updates, lists, and deletes labor lines",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        //************************************************************** */
        // Create customer

        const customerResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .send({
              type: "INDIVIDUAL",
              firstName: "Labor",
              lastName: "Customer",
              email:
                "labor.customer@motodesk.local",
            });

        assert.equal(
          customerResponse.status,
          201,
        );

        const customerId =
          customerResponse.body.data.id;

        //************************************************************** */
        // Create vehicle

        const vehicleResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/vehicles`,
            )
            .send({
              customerId,
              year: 2025,
              make: "Kawasaki",
              model: "KX450",
              vin:
                `LABOR-VIN-${Date.now()}`,
              type: "MOTORCYCLE",
              classification:
                "SERVICE",
            });

        assert.equal(
          vehicleResponse.status,
          201,
        );

        const vehicleId =
          vehicleResponse.body.data.id;

        //************************************************************** */
        // Create repair order

        const repairOrderResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders`,
            )
            .send({
              customerId,
              vehicleId,
              complaint:
                "Engine inspection and valve adjustment.",
            });

        assert.equal(
          repairOrderResponse.status,
          201,
        );

        const repairOrderId =
          repairOrderResponse.body.data.id;

        //************************************************************** */
        // Create labor line

        const createResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
            )
            .send({
              description:
                "Inspect and adjust valve clearance",
              hours: 2.5,
              rate: 125,
            });

        assert.equal(
          createResponse.status,
          201,
        );

        assert.equal(
          createResponse.body.success,
          true,
        );

        const laborLineId =
          createResponse.body.data.id;

        assert.equal(
          typeof laborLineId,
          "string",
        );

        assert.equal(
          createResponse.body.data.description,
          "Inspect and adjust valve clearance",
        );

        assert.equal(
          Number(
            createResponse.body.data.hours,
          ),
          2.5,
        );

        assert.equal(
          Number(
            createResponse.body.data.rate,
          ),
          125,
        );

        assert.equal(
          createResponse.body.data.completed,
          false,
        );

        //************************************************************** */
        // Get labor line

        const getResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}`,
          );

        assert.equal(
          getResponse.status,
          200,
        );

        assert.equal(
          getResponse.body.data.id,
          laborLineId,
        );

        //************************************************************** */
        // Update labor line

        const updateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}`,
            )
            .send({
              hours: 3,
              completed: true,
            });

        assert.equal(
          updateResponse.status,
          200,
        );

        assert.equal(
          Number(
            updateResponse.body.data.hours,
          ),
          3,
        );

        assert.equal(
          updateResponse.body.data.completed,
          true,
        );

        //************************************************************** */
        // List labor lines

        const listResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
          );

        assert.equal(
          listResponse.status,
          200,
        );

        assert.equal(
          listResponse.body.success,
          true,
        );

        const laborLineFound =
          listResponse.body.data.some(
            (
              laborLine: {
                id: string;
              },
            ) =>
              laborLine.id ===
              laborLineId,
          );

        assert.equal(
          laborLineFound,
          true,
        );

        //************************************************************** */
        // Delete labor line

        const deleteResponse =
          await agent.delete(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}`,
          );

        assert.equal(
          deleteResponse.status,
          200,
        );

        assert.equal(
          deleteResponse.body.success,
          true,
        );

        assert.equal(
          deleteResponse.body.data.deleted,
          true,
        );

        //************************************************************** */
        // Confirm deleted

        const missingResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}`,
          );

        assert.equal(
          missingResponse.status,
          404,
        );

        assert.equal(
          missingResponse.body.code,
          "REPAIR_ORDER_LABOR_LINE_NOT_FOUND",
        );
      },
    );
  },
);