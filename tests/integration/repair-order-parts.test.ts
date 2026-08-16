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
      "creates, allocates, deallocates, updates, lists, and protects repair order part lines",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const uniqueSuffix =
          Date.now().toString();

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
                2,
              unitPrice:
                59.99,
              requiredQty:
                2,
              approvedQty:
                2,
              estimatedCost:
                70,
              resolutionMethod:
                "SHOP_INVENTORY",
              blocksWork:
                true,
            });

        assert.equal(
          createResponse.status,
          201,
        );

        const partLineId =
          createResponse.body.data.id;

        const allocationResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/allocate`,
            )
            .send({
              quantity:
                2,
            });

        assert.equal(
          allocationResponse.status,
          200,
        );

        assert.equal(
          Number(
            allocationResponse.body.data.allocatedQty,
          ),
          2,
        );

        const partialDeallocationResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/deallocate`,
            )
            .send({
              quantity:
                1,
            });

        assert.equal(
          partialDeallocationResponse.status,
          200,
        );

        assert.equal(
          Number(
            partialDeallocationResponse.body.data.allocatedQty,
          ),
          1,
        );

        const finalDeallocationResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/deallocate`,
            )
            .send({
              quantity:
                1,
            });

        assert.equal(
          finalDeallocationResponse.status,
          200,
        );

        assert.equal(
          finalDeallocationResponse.body.data.status,
          "AVAILABLE",
        );

        assert.equal(
          Number(
            finalDeallocationResponse.body.data.allocatedQty,
          ),
          0,
        );

        const updateResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}`,
            )
            .send({
              actualCost:
                36,
              vendorName:
                "MotoDesk Test Vendor",
            });

        assert.equal(
          updateResponse.status,
          200,
        );

        const listResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
          );

        assert.equal(
          listResponse.status,
          200,
        );

        const deleteResponse =
          await agent.delete(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}`,
          );

        assert.equal(
          deleteResponse.status,
          200,
        );
      },
    );

    //************************************************************** */

    it(
      "issues allocated inventory and synchronizes the RO part line and inventory ledger",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const uniqueSuffix =
          `${Date.now()}-issue`;

        //************************************************************** */
        // Customer

        const customerResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .send({
              type: "INDIVIDUAL",
              firstName: "Issue",
              lastName: "Customer",
            });

        assert.equal(
          customerResponse.status,
          201,
        );

        const customerId =
          customerResponse.body.data.id;

        //************************************************************** */
        // Vehicle

        const vehicleResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/vehicles`,
            )
            .send({
              customerId,
              make: "Yamaha",
              model: "YZ250F",
              vin:
                `ISSUE-VIN-${uniqueSuffix}`,
              type: "MOTORCYCLE",
            });

        assert.equal(
          vehicleResponse.status,
          201,
        );

        const vehicleId =
          vehicleResponse.body.data.id;

        //************************************************************** */
        // Repair order

        const repairOrderResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders`,
            )
            .send({
              customerId,
              vehicleId,
              complaint:
                "Replace clutch plates.",
            });

        assert.equal(
          repairOrderResponse.status,
          201,
        );

        const repairOrderId =
          repairOrderResponse.body.data.id;

        //************************************************************** */
        // Inventory part

        const partNumber =
          `CLUTCH-${uniqueSuffix}`;

        const partResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/parts`,
            )
            .send({
              partNumber,
              description:
                "Clutch friction plate",
              qtyOnHand:
                5,
              costPrice:
                12,
              sellPrice:
                22,
            });

        assert.equal(
          partResponse.status,
          201,
        );

        const partId =
          partResponse.body.data.id;

        //************************************************************** */
        // RO part line

        const partLineResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
            )
            .send({
              partId,
              partNumber,
              description:
                "Clutch friction plate",
              quantity:
                2,
              requiredQty:
                2,
              approvedQty:
                2,
              unitPrice:
                22,
              resolutionMethod:
                "SHOP_INVENTORY",
            });

        assert.equal(
          partLineResponse.status,
          201,
        );

        const partLineId =
          partLineResponse.body.data.id;

        //************************************************************** */
        // Allocate 2

        const allocationResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/allocate`,
            )
            .send({
              quantity:
                2,
            });

        assert.equal(
          allocationResponse.status,
          200,
        );

        assert.equal(
          Number(
            allocationResponse.body.data.allocatedQty,
          ),
          2,
        );

        //************************************************************** */
        // Issue 1

        const issueResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/issue`,
            )
            .send({
              quantity:
                1,
              notes:
                "Issued to technician.",
            });

        assert.equal(
          issueResponse.status,
          200,
        );

        assert.equal(
          issueResponse.body.success,
          true,
        );

        assert.equal(
          issueResponse.body.data.status,
          "ISSUED",
        );

        assert.equal(
          Number(
            issueResponse.body.data.allocatedQty,
          ),
          1,
        );

        assert.equal(
          Number(
            issueResponse.body.data.pulledQty,
          ),
          1,
        );

        //************************************************************** */
        // Verify inventory balances

        const partAfterIssue =
          await agent.get(
            `/api/v1/organizations/${organizationId}/parts/${partId}`,
          );

        assert.equal(
          partAfterIssue.status,
          200,
        );

        assert.equal(
          Number(
            partAfterIssue.body.data.qtyOnHand,
          ),
          4,
        );

        assert.equal(
          Number(
            partAfterIssue.body.data.qtyAllocated,
          ),
          1,
        );

        //************************************************************** */
        // Reject issue greater than remaining allocation

        const excessiveIssueResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/issue`,
            )
            .send({
              quantity:
                2,
            });

        assert.equal(
          excessiveIssueResponse.status,
          400,
        );

        assert.equal(
          excessiveIssueResponse.body.code,
          "REPAIR_ORDER_PART_ISSUE_EXCEEDS_ALLOCATED",
        );

        //************************************************************** */
        // Issue remaining 1

        const finalIssueResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/issue`,
            )
            .send({
              quantity:
                1,
            });

        assert.equal(
          finalIssueResponse.status,
          200,
        );

        assert.equal(
          Number(
            finalIssueResponse.body.data.allocatedQty,
          ),
          0,
        );

        assert.equal(
          Number(
            finalIssueResponse.body.data.pulledQty,
          ),
          2,
        );

        //************************************************************** */
        // Verify final inventory balances

        const finalPartResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/parts/${partId}`,
          );

        assert.equal(
          Number(
            finalPartResponse.body.data.qtyOnHand,
          ),
          3,
        );

        assert.equal(
          Number(
            finalPartResponse.body.data.qtyAllocated,
          ),
          0,
        );

        //************************************************************** */
        // Verify ledger

        const transactionsResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/parts/${partId}/inventory/transactions`,
          );

        assert.equal(
          transactionsResponse.status,
          200,
        );

        const issueTransactions =
          transactionsResponse.body.data.filter(
            (
              transaction: {
                type: string;
                referenceType: string | null;
                referenceId: string | null;
              },
            ) =>
              transaction.type ===
                "ISSUE" &&
              transaction.referenceType ===
                "REPAIR_ORDER" &&
              transaction.referenceId ===
                repairOrderId,
          );

        assert.equal(
          issueTransactions.length,
          2,
        );

        //************************************************************** */
        // Deletion must remain blocked after inventory was issued

        const deleteResponse =
          await agent.delete(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}`,
          );

        assert.equal(
          deleteResponse.status,
          400,
        );

        assert.equal(
          deleteResponse.body.code,
          "REPAIR_ORDER_PART_LINE_HAS_INVENTORY_ACTIVITY",
        );
      },
    );
  },
);