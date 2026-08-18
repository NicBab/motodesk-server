import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

export async function createPartsReviewFixture(options: {
  qtyOnHand: number;
  suffix: string;
}) {
  const { agent, organizationId } = await createAuthenticatedAgent();

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",

      firstName: "Parts Review",

      lastName: "Customer",
    });

  assert.equal(customerResponse.status, 201);

  const customerId = customerResponse.body.data.id;

  //************************************************************** */
  // Vehicle

  const vehicleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vehicles`)
    .send({
      customerId,

      make: "Honda",

      model: "CRF450R",

      vin: `PARTS-REVIEW-${options.suffix}`,

      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  const vehicleId = vehicleResponse.body.data.id;

  //************************************************************** */
  // Repair Order

  const repairOrderResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/repair-orders`)
    .send({
      customerId,
      vehicleId,

      complaint: "Parts review workflow test.",
    });

  assert.equal(repairOrderResponse.status, 201);

  const repairOrderId = repairOrderResponse.body.data.id;

  //************************************************************** */
  // Request customer approval

  const requestApprovalResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/request`,
    )
    .send({
      notes: "Estimate ready for customer approval.",
    });

  assert.equal(requestApprovalResponse.status, 200);

  assert.equal(
    requestApprovalResponse.body.data.status,
    "AWAITING_CUSTOMER_APPROVAL",
  );

  //************************************************************** */
  // Approve
  // Approval automatically hands RO to PARTS_REVIEW.

  const approvalResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/approve`,
    )
    .send({
      approvalMethod: "PHONE",

      approvedBy: "Parts Review Customer",

      approvedAmount: 500,

      notes: "Customer approved repair.",
    });

  assert.equal(approvalResponse.status, 200);

  assert.equal(approvalResponse.body.data.status, "PARTS_REVIEW");

  //************************************************************** */
  // Catalog Part

  const partNumber = `REVIEW-PART-${options.suffix}`;

  const partResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/parts`)
    .send({
      partNumber,

      description: "Parts review test component",

      qtyOnHand: options.qtyOnHand,

      costPrice: 25,

      sellPrice: 50,
    });

  assert.equal(partResponse.status, 201);

  const partId = partResponse.body.data.id;

  //************************************************************** */
  // Blocking RO Part Line

  const partLineResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
    )
    .send({
      partId,
      partNumber,

      description: "Parts review test component",

      quantity: 1,

      unitPrice: 50,

      requiredQty: 1,

      approvedQty: 1,

      estimatedCost: 25,

      resolutionMethod: "SHOP_INVENTORY",

      blocksWork: true,
    });

  assert.equal(partLineResponse.status, 201);

  const partLineId = partLineResponse.body.data.id;

  return {
    agent,
    organizationId,
    repairOrderId,
    partId,
    partLineId,
  };
}

//************************************************************** */
//************************************************************** */

describe("Repair Order parts review integration", () => {
  it("rejects completion while a blocking part still needs review", async () => {
    const fixture = await createPartsReviewFixture({
      qtyOnHand: 0,

      suffix: `${Date.now()}-unresolved`,
    });

    const { agent, organizationId, repairOrderId } = fixture;

    //************************************************************** */
    // Part line has intentionally not been resolved.
    // It should still be NEEDS_REVIEW.

    const completeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/parts-review/complete`,
      )
      .send({
        notes: "Attempting to complete parts review.",
      });

    assert.equal(completeResponse.status, 400);

    assert.equal(
      completeResponse.body.code,
      "REPAIR_ORDER_PARTS_REVIEW_INCOMPLETE",
    );

    //************************************************************** */
    // RO remains in PARTS_REVIEW

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "PARTS_REVIEW");
  });

  //************************************************************** */
  //************************************************************** */

  it("moves the repair order to WAITING_ON_PARTS when reviewed parts must be ordered", async () => {
    const fixture = await createPartsReviewFixture({
      qtyOnHand: 0,

      suffix: `${Date.now()}-ordered`,
    });

    const { agent, organizationId, repairOrderId, partLineId } = fixture;

    //************************************************************** */
    // Parts Manager determines this part must be ordered.

    const toBeOrderedResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/to-be-ordered`,
      )
      .send({
        notes: "Part is not available in shop inventory.",
      });

    assert.equal(toBeOrderedResponse.status, 200);

    assert.equal(toBeOrderedResponse.body.data.status, "TO_BE_ORDERED");

    //************************************************************** */
    // Complete Parts Review

    const completeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/parts-review/complete`,
      )
      .send({
        notes: "Parts review complete. Required part must be ordered.",
      });

    assert.equal(completeResponse.status, 200);

    assert.equal(completeResponse.body.data.status, "WAITING_ON_PARTS");

    //************************************************************** */
    // Verify persisted RO state

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "WAITING_ON_PARTS");

    //************************************************************** */
    // Verify status history

    const waitingHistory = repairOrderResponse.body.data.statusHistory.find(
      (history: { status: string; previousStatus: string | null }) =>
        history.status === "WAITING_ON_PARTS" &&
        history.previousStatus === "PARTS_REVIEW",
    );

    assert.notEqual(waitingHistory, undefined);
  });

  //************************************************************** */
  //************************************************************** */

  it("moves the repair order to READY_TO_WORK when all blocking parts are available from stock", async () => {
    const fixture = await createPartsReviewFixture({
      qtyOnHand: 5,

      suffix: `${Date.now()}-stock`,
    });

    const { agent, organizationId, repairOrderId, partLineId } = fixture;

    //************************************************************** */
    // Parts Manager allocates the required part from stock.

    const allocationResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/allocate`,
      )
      .send({
        quantity: 1,
      });

    assert.equal(allocationResponse.status, 200);

    assert.equal(Number(allocationResponse.body.data.allocatedQty), 1);

    //************************************************************** */
    // Pull allocated part from stock

    const pullResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/pull`,
      )
      .send({
        quantity: 1,

        notes: "Part pulled from shelf.",
      });

    assert.equal(pullResponse.status, 200);

    assert.equal(Number(pullResponse.body.data.pulledQty), 1);

    assert.equal(pullResponse.body.data.status, "PULLED");

    //************************************************************** */
    // Stage part for technician

    const stageResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/stage`,
      )
      .send({
        notes: "Part staged for technician.",
      });

    assert.equal(stageResponse.status, 200);

    assert.equal(stageResponse.body.data.status, "STAGED");

    //************************************************************** */
    // Complete Parts Review

    const completeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/parts-review/complete`,
      )
      .send({
        notes: "All required parts allocated from shop inventory.",
      });

    assert.equal(completeResponse.status, 200);

    assert.equal(completeResponse.body.data.status, "READY_TO_WORK");

    //************************************************************** */
    // Verify persisted RO state

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "READY_TO_WORK");

    //************************************************************** */
    // Verify status history

    const readyHistory = repairOrderResponse.body.data.statusHistory.find(
      (history: { status: string; previousStatus: string | null }) =>
        history.status === "READY_TO_WORK" &&
        history.previousStatus === "PARTS_REVIEW",
    );

    assert.notEqual(readyHistory, undefined);
  });

  //************************************************************** */
  //************************************************************** */

  it("rejects pulling more inventory than is allocated to the repair order part line", async () => {
    const fixture = await createPartsReviewFixture({
      qtyOnHand: 5,

      suffix: `${Date.now()}-pull-exceeds`,
    });

    const { agent, organizationId, repairOrderId, partLineId } = fixture;

    //************************************************************** */
    // Allocate one part from inventory

    const allocationResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/allocate`,
      )
      .send({
        quantity: 1,
      });

    assert.equal(allocationResponse.status, 200);

    assert.equal(Number(allocationResponse.body.data.allocatedQty), 1);

    //************************************************************** */
    // Attempt to pull more than allocated

    const pullResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/pull`,
      )
      .send({
        quantity: 2,
      });

    assert.equal(pullResponse.status, 400);

    assert.equal(
      pullResponse.body.code,
      "REPAIR_ORDER_PART_PULL_EXCEEDS_ALLOCATION",
    );

    //************************************************************** */
    // Verify nothing was pulled

    const partLineResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}`,
    );

    assert.equal(partLineResponse.status, 200);

    assert.equal(Number(partLineResponse.body.data.pulledQty), 0);
  });

  //************************************************************** */
  //************************************************************** */

  it("rejects staging an allocated part before the full allocated quantity has been pulled", async () => {
    const fixture = await createPartsReviewFixture({
      qtyOnHand: 5,

      suffix: `${Date.now()}-stage-before-pull`,
    });

    const { agent, organizationId, repairOrderId, partLineId } = fixture;

    //************************************************************** */
    // Allocate one part from inventory

    const allocationResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/allocate`,
      )
      .send({
        quantity: 1,
      });

    assert.equal(allocationResponse.status, 200);

    assert.equal(Number(allocationResponse.body.data.allocatedQty), 1);

    //************************************************************** */
    // Attempt to stage without physically pulling it

    const stageResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}/stage`,
      )
      .send({});

    assert.equal(stageResponse.status, 400);

    assert.equal(stageResponse.body.code, "REPAIR_ORDER_PART_STAGE_NOT_READY");

    //************************************************************** */
    // Verify part remains un-staged

    const partLineResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${partLineId}`,
    );

    assert.equal(partLineResponse.status, 200);

    assert.notEqual(partLineResponse.body.data.status, "STAGED");

    assert.equal(Number(partLineResponse.body.data.pulledQty), 0);
  });
});
