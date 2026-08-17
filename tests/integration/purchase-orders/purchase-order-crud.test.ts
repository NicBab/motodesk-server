import assert from "node:assert/strict";
import {
  describe,
  it,
} from "node:test";

import {
  createPurchaseOrderFixture,
} from "./helpers/purchase-order-fixture.js";

//************************************************************** */

describe(
  "Purchase Order CRUD integration",
  () => {
    it(
      "creates, retrieves, searches, updates, and allocates sequential PO numbers",
      async () => {
        const first =
          await createPurchaseOrderFixture();

        const {
          agent,
          organizationId,
          vendorId,
          purchaseOrderId,
          partNumber,
        } =
          first;

        const firstPurchaseOrderResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
          );

        assert.equal(
          firstPurchaseOrderResponse.status,
          200,
        );

        const firstPoNumber =
          firstPurchaseOrderResponse.body.data.poNumber;

        assert.equal(
          firstPurchaseOrderResponse.body.data.status,
          "DRAFT",
        );

        //************************************************************** */
        // Search

        const listResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/purchase-orders`,
            )
            .query({
              search:
                partNumber,
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
        // Update draft

        const updateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
            )
            .send({
              vendorReference:
                "UPDATED-REFERENCE",

              shippingCost:
                20,

              taxAmount:
                7,

              notes:
                "Updated purchase order.",
            });

        assert.equal(
          updateResponse.status,
          200,
        );

        assert.equal(
          updateResponse.body.data.vendorReference,
          "UPDATED-REFERENCE",
        );

        assert.equal(
          Number(
            updateResponse.body.data.shippingCost,
          ),
          20,
        );

        //************************************************************** */
        // Second PO in same organization

        const secondResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/purchase-orders`,
            )
            .send({
              vendorId,

              lines: [
                {
                  partId:
                    first.partId,

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