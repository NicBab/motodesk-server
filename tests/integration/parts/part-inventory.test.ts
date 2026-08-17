import assert from "node:assert/strict";
import {
  describe,
  it,
} from "node:test";

import {
  createAuthenticatedAgent,
} from "../helpers/authenticated-agent.js";

//************************************************************** */

describe(
  "Part Inventory integration",
  () => {
    it(
      "adjusts, receives, allocates, issues, returns, damages, cycle-counts, and records ledger history",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const uniqueSuffix =
          Date.now().toString();

        //************************************************************** */
        // Create part with opening stock

        const createPartResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts`,
            )
            .send({
              partNumber:
                `INV-${uniqueSuffix}`,
              description:
                "Inventory integration test part",
              qtyOnHand:
                10,
              reorderPoint:
                2,
              costPrice:
                5,
              sellPrice:
                10,
            });

        assert.equal(
          createPartResponse.status,
          201,
        );

        const partId =
          createPartResponse.body.data.id;

        //************************************************************** */
        // Adjust +2

        const adjustResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/adjust`,
            )
            .send({
              quantity: 2,
              notes:
                "Positive adjustment",
            });

        assert.equal(
          adjustResponse.status,
          200,
        );

        assert.equal(
          Number(
            adjustResponse.body.data.part.qtyOnHand,
          ),
          12,
        );

        //************************************************************** */
        // Receive +5

        const receiveResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/receive`,
            )
            .send({
              quantity: 5,
              referenceType:
                "TEST_RECEIPT",
              referenceId:
                `REF-${uniqueSuffix}`,
            });

        assert.equal(
          receiveResponse.status,
          200,
        );

        assert.equal(
          Number(
            receiveResponse.body.data.part.qtyOnHand,
          ),
          17,
        );

        //************************************************************** */
        // Allocate 4

        const allocateResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/allocate`,
            )
            .send({
              quantity: 4,
              referenceType:
                "REPAIR_ORDER",
              referenceId:
                "TEST-RO",
            });

        assert.equal(
          allocateResponse.status,
          200,
        );

        assert.equal(
          Number(
            allocateResponse.body.data.part.qtyAllocated,
          ),
          4,
        );

        //************************************************************** */
        // Issue 3

        const issueResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/issue`,
            )
            .send({
              quantity: 3,
              referenceType:
                "REPAIR_ORDER",
              referenceId:
                "TEST-RO",
            });

        assert.equal(
          issueResponse.status,
          200,
        );

        assert.equal(
          Number(
            issueResponse.body.data.part.qtyOnHand,
          ),
          14,
        );

        assert.equal(
          Number(
            issueResponse.body.data.part.qtyAllocated,
          ),
          1,
        );

        //************************************************************** */
        // Deallocate remaining 1

        const deallocateResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/deallocate`,
            )
            .send({
              quantity: 1,
              referenceType:
                "REPAIR_ORDER",
              referenceId:
                "TEST-RO",
            });

        assert.equal(
          deallocateResponse.status,
          200,
        );

        assert.equal(
          Number(
            deallocateResponse.body.data.part.qtyAllocated,
          ),
          0,
        );

        //************************************************************** */
        // Return +1

        const returnResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/return`,
            )
            .send({
              quantity: 1,
            });

        assert.equal(
          returnResponse.status,
          200,
        );

        assert.equal(
          Number(
            returnResponse.body.data.part.qtyOnHand,
          ),
          15,
        );

        //************************************************************** */
        // Damage 2

        const damageResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/damage`,
            )
            .send({
              quantity: 2,
              notes:
                "Damaged during handling",
            });

        assert.equal(
          damageResponse.status,
          200,
        );

        assert.equal(
          Number(
            damageResponse.body.data.part.qtyOnHand,
          ),
          13,
        );

        //************************************************************** */
        // Cycle count to 12

        const cycleCountResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/cycle-count`,
            )
            .send({
              countedQuantity:
                12,
              notes:
                "Physical count",
            });

        assert.equal(
          cycleCountResponse.status,
          200,
        );

        assert.equal(
          Number(
            cycleCountResponse.body.data.part.qtyOnHand,
          ),
          12,
        );

        //************************************************************** */
        // Reject over-allocation

        const overAllocateResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/allocate`,
            )
            .send({
              quantity:
                1000,
            });

        assert.equal(
          overAllocateResponse.status,
          400,
        );

        assert.equal(
          overAllocateResponse.body.code,
          "INSUFFICIENT_AVAILABLE_INVENTORY",
        );

        //************************************************************** */
        // List ledger

        const transactionsResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/transactions`,
          );

        assert.equal(
          transactionsResponse.status,
          200,
        );

        assert.equal(
          transactionsResponse.body.success,
          true,
        );

        const transactionTypes =
          transactionsResponse.body.data.map(
            (
              transaction: {
                type: string;
              },
            ) =>
              transaction.type,
          );

        assert.equal(
          transactionTypes.includes(
            "INITIAL",
          ),
          true,
        );

        assert.equal(
          transactionTypes.includes(
            "ADJUSTMENT",
          ),
          true,
        );

        assert.equal(
          transactionTypes.includes(
            "RECEIPT",
          ),
          true,
        );

        assert.equal(
          transactionTypes.includes(
            "ALLOCATION",
          ),
          true,
        );

        assert.equal(
          transactionTypes.includes(
            "ISSUE",
          ),
          true,
        );

        assert.equal(
          transactionTypes.includes(
            "DEALLOCATION",
          ),
          true,
        );

        assert.equal(
          transactionTypes.includes(
            "RETURN",
          ),
          true,
        );

        assert.equal(
          transactionTypes.includes(
            "DAMAGE",
          ),
          true,
        );

        assert.equal(
          transactionTypes.includes(
            "CYCLE_COUNT",
          ),
          true,
        );
      },
    );
  },
);