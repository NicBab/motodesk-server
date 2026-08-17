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
  "Purchase Order integration",
  () => {
    it(
      "creates, retrieves, searches, updates, and allocates sequential PO numbers",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const uniqueSuffix =
          Date.now().toString();

        //************************************************************** */
        // Create vendor

        const vendorResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/vendors`,
            )
            .send({
              name:
                `PO Vendor ${uniqueSuffix}`,
            });

        assert.equal(
          vendorResponse.status,
          201,
        );

        const vendorId =
          vendorResponse.body.data.id;

        //************************************************************** */
        // Create part

        const partResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts`,
            )
            .send({
              partNumber:
                `PO-PART-${uniqueSuffix}`,
              description:
                "Purchase order test part",
              qtyOnHand:
                0,
              costPrice:
                10,
              sellPrice:
                20,
            });

        assert.equal(
          partResponse.status,
          201,
        );

        const partId =
          partResponse.body.data.id;

        //************************************************************** */
        // Create first PO

        const createResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/purchase-orders`,
            )
            .send({
              vendorId,
              vendorReference:
                `VREF-${uniqueSuffix}`,
              shippingCost:
                15,
              taxAmount:
                5,
              notes:
                "Purchase order integration test.",
              lines: [
                {
                  partId,
                  orderedQty:
                    3,
                  unitCost:
                    10,
                },
              ],
            });

        assert.equal(
          createResponse.status,
          201,
        );

        assert.equal(
          createResponse.body.success,
          true,
        );

        const purchaseOrderId =
          createResponse.body.data.id;

        const firstPoNumber =
          createResponse.body.data.poNumber;

        assert.equal(
          typeof purchaseOrderId,
          "string",
        );

        assert.equal(
          typeof firstPoNumber,
          "number",
        );

        assert.equal(
          createResponse.body.data.status,
          "DRAFT",
        );

        assert.equal(
          createResponse.body.data.vendorId,
          vendorId,
        );

        assert.equal(
          createResponse.body.data.lines.length,
          1,
        );

        assert.equal(
          createResponse.body.data.lines[0].partId,
          partId,
        );

        assert.equal(
          createResponse.body.data.lines[0].partNumber,
          `PO-PART-${uniqueSuffix}`,
        );

        assert.equal(
          createResponse.body.data.lines[0].description,
          "Purchase order test part",
        );

        assert.equal(
          Number(
            createResponse.body.data.lines[0].orderedQty,
          ),
          3,
        );

        //************************************************************** */
        // Get PO

        const getResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
          );

        assert.equal(
          getResponse.status,
          200,
        );

        assert.equal(
          getResponse.body.data.id,
          purchaseOrderId,
        );

        //************************************************************** */
        // Search/list PO

        const listResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/purchase-orders`,
            )
            .query({
              search:
                `PO-PART-${uniqueSuffix}`,
              status:
                "DRAFT",
              vendorId,
              isActive:
                "true",
            });

        assert.equal(
          listResponse.status,
          200,
        );

        assert.equal(
          listResponse.body.success,
          true,
        );

        const found =
          listResponse.body.data.some(
            (
              purchaseOrder: {
                id: string;
              },
            ) =>
              purchaseOrder.id ===
              purchaseOrderId,
          );

        assert.equal(
          found,
          true,
        );

        //************************************************************** */
        // Update draft PO

        const updateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
            )
            .send({
              vendorReference:
                `UPDATED-${uniqueSuffix}`,
              shippingCost:
                20,
              taxAmount:
                7,
              notes:
                "Updated PO integration test.",
            });

        assert.equal(
          updateResponse.status,
          200,
        );

        assert.equal(
          updateResponse.body.data.vendorReference,
          `UPDATED-${uniqueSuffix}`,
        );

        assert.equal(
          Number(
            updateResponse.body.data.shippingCost,
          ),
          20,
        );

        assert.equal(
          Number(
            updateResponse.body.data.taxAmount,
          ),
          7,
        );

        //************************************************************** */
        // Create second PO to verify sequence

        const secondResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/purchase-orders`,
            )
            .send({
              vendorId,
              lines: [
                {
                  partId,
                  orderedQty:
                    1,
                  unitCost:
                    10,
                },
              ],
            });

        assert.equal(
          secondResponse.status,
          201,
        );

        assert.equal(
          secondResponse.body.data.poNumber,
          firstPoNumber + 1,
        );
      },
    );
  },
);