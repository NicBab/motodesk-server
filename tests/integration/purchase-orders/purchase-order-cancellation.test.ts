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
  "Purchase Order cancellation integration",
  () => {
    it(
      "cancels the outstanding remainder of a partially received purchase order",
      async () => {
        const fixture =
          await createPurchaseOrderFixture({
            orderedQty: 5,
            qtyOnHand: 0,
            withRepairOrderPartLine: true,
          });

        const {
          agent,
          organizationId,
          purchaseOrderId,
          purchaseOrderLineId,
          partId,
          repairOrderId,
          repairOrderPartLineId,
        } =
          fixture;

        if (
          !repairOrderId ||
          !repairOrderPartLineId
        ) {
          throw new Error(
            "Repair order fixture was not created.",
          );
        }

        //************************************************************** */
        // Order PO

        const orderResponse =
          await agent.post(
            `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
          );

        assert.equal(
          orderResponse.status,
          200,
        );

        assert.equal(
          orderResponse.body.data.status,
          "ORDERED",
        );

        //************************************************************** */
        // Receive 2 of 5

        const receiveResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/receive`,
            )
            .send({
              purchaseOrderLineId,

              quantity:
                2,
            });

        assert.equal(
          receiveResponse.status,
          200,
        );

        assert.equal(
          receiveResponse.body.data.status,
          "PARTIALLY_RECEIVED",
        );

        //************************************************************** */
        // Verify balances before cancellation

        const partBeforeCancel =
          await agent.get(
            `/api/v1/organizations/${organizationId}/parts/${partId}`,
          );

        assert.equal(
          partBeforeCancel.status,
          200,
        );

        assert.equal(
          Number(
            partBeforeCancel.body.data.qtyOnHand,
          ),
          2,
        );

        assert.equal(
          Number(
            partBeforeCancel.body.data.qtyOnOrder,
          ),
          3,
        );

        //************************************************************** */
        // Cancel remaining quantity

        const cancelResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/cancel`,
            )
            .send({
              notes:
                "Vendor cannot supply remaining quantity.",
            });

        assert.equal(
          cancelResponse.status,
          200,
        );

        assert.equal(
          cancelResponse.body.data.status,
          "CANCELLED",
        );

        //************************************************************** */
        // Received stock stays on hand.
        // Outstanding on-order quantity clears.

        const partAfterCancel =
          await agent.get(
            `/api/v1/organizations/${organizationId}/parts/${partId}`,
          );

        assert.equal(
          partAfterCancel.status,
          200,
        );

        assert.equal(
          Number(
            partAfterCancel.body.data.qtyOnHand,
          ),
          2,
        );

        assert.equal(
          Number(
            partAfterCancel.body.data.qtyOnOrder,
          ),
          0,
        );

        //************************************************************** */
        // Linked RO part line retains received quantity
        // and becomes BACKORDERED.

        const roPartLineAfterCancel =
          await agent.get(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}`,
          );

        assert.equal(
          roPartLineAfterCancel.status,
          200,
        );

        assert.equal(
          Number(
            roPartLineAfterCancel.body.data.receivedQty,
          ),
          2,
        );

        assert.equal(
          Number(
            roPartLineAfterCancel.body.data.orderedQty,
          ),
          2,
        );

        assert.equal(
          roPartLineAfterCancel.body.data.status,
          "BACKORDERED",
        );

        //************************************************************** */
        // Verify cancellation ledger

        const transactionsResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/transactions`,
          );

        assert.equal(
          transactionsResponse.status,
          200,
        );

        const cancellationTransaction =
          transactionsResponse.body.data.find(
            (
              transaction: {
                type: string;
                referenceType: string | null;
                referenceId: string | null;
              },
            ) =>
              transaction.type ===
                "PURCHASE_CANCELLED" &&
              transaction.referenceType ===
                "PURCHASE_ORDER" &&
              transaction.referenceId ===
                purchaseOrderId,
          );

        assert.notEqual(
          cancellationTransaction,
          undefined,
        );

        assert.equal(
          Number(
            cancellationTransaction.quantity,
          ),
          3,
        );

        //************************************************************** */
        // Reject duplicate cancellation

        const secondCancelResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/cancel`,
            )
            .send({});

        assert.equal(
          secondCancelResponse.status,
          400,
        );

        assert.equal(
          secondCancelResponse.body.code,
          "PURCHASE_ORDER_NOT_CANCELLABLE",
        );
      },
    );
  },
);