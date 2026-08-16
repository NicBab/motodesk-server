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
  "Repair Order Parts integration",
  () => {
    it(
      "creates, retrieves, updates, lists, and deletes repair order part lines",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const uniqueSuffix =
          Date.now().toString();

        //************************************************************** */
        // Create customer

        const customerResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .send({
              type: "INDIVIDUAL",
              firstName: "Parts",
              lastName: "Customer",
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
              make: "Honda",
              model: "CRF250R",
              vin:
                `PARTLINE-VIN-${uniqueSuffix}`,
              type: "MOTORCYCLE",
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
                "Replace front brake pads.",
            });

        assert.equal(
          repairOrderResponse.status,
          201,
        );

        const repairOrderId =
          repairOrderResponse.body.data.id;

        //************************************************************** */
        // Create catalog part

        const partNumber =
          `BRAKE-${uniqueSuffix}`;

        const partResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts`,
            )
            .send({
              partNumber,
              description:
                "Front brake pad set",
              qtyOnHand:
                5,
              costPrice:
                35,
              sellPrice:
                59.99,
            });

        assert.equal(
          partResponse.status,
          201,
        );

        const partId =
          partResponse.body.data.id;

        //************************************************************** */
        // Create RO part line

        const createResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
            )
            .send({
              partId,
              partNumber,
              description:
                "Front brake pad set",
              quantity:
                1,
              unitPrice:
                59.99,
              requiredQty:
                1,
              approvedQty:
                1,
              estimatedCost:
                35,
              status:
                "NEEDS_REVIEW",
              resolutionMethod:
                "SHOP_INVENTORY",
              blocksWork:
                true,
            });

        assert.equal(
          createResponse.status,
          201,
        );

        assert.equal(
          createResponse.body.success,
          true,
        );

        const partLineId =
          createResponse.body.data.id;

        assert.equal(
          typeof partLineId,
          "string",
        );

        assert.equal(
          createResponse.body.data.partId,
          partId,
        );

        assert.equal(
          createResponse.body.data.status,
          "NEEDS_REVIEW",
        );

        //************************************************************** */
        // Get RO part line

        const getResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}`,
          );

        assert.equal(
          getResponse.status,
          200,
        );

        assert.equal(
          getResponse.body.data.id,
          partLineId,
        );

        //************************************************************** */
        // Update RO part line

        const updateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}`,
            )
            .send({
              approvedQty:
                1,
              actualCost:
                36,
              vendorName:
                "MotoDesk Test Vendor",
              status:
                "AVAILABLE",
            });

        assert.equal(
          updateResponse.status,
          200,
        );

        assert.equal(
          updateResponse.body.data.status,
          "AVAILABLE",
        );

        assert.equal(
          Number(
            updateResponse.body.data.actualCost,
          ),
          36,
        );

        //************************************************************** */
        // List RO part lines

        const listResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
          );

        assert.equal(
          listResponse.status,
          200,
        );

        assert.equal(
          listResponse.body.success,
          true,
        );

        const partLineFound =
          listResponse.body.data.some(
            (
              line: {
                id: string;
              },
            ) =>
              line.id ===
              partLineId,
          );

        assert.equal(
          partLineFound,
          true,
        );

        //************************************************************** */
        // Delete RO part line

        const deleteResponse =
          await agent.delete(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}`,
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
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}`,
          );

        assert.equal(
          missingResponse.status,
          404,
        );

        assert.equal(
          missingResponse.body.code,
          "REPAIR_ORDER_PART_LINE_NOT_FOUND",
        );
      },
    );
  },
);