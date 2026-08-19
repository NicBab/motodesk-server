import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

async function moveRepairOrderToReadyForPickup() {
  const { agent, organizationId, repairOrderId, laborLineId } =
    await createInProgressRepairOrderFixture();

  //************************************************************** */
  // Complete Labor → WORK_COMPLETE

  const completionResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
    )
    .send({
      notes: "Repair work completed.",
    });

  assert.equal(completionResponse.status, 200);

  //************************************************************** */
  // Begin QC

  const beginQcResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/begin`,
    )
    .send({
      notes: "Beginning quality check.",
    });

  assert.equal(beginQcResponse.status, 200);

  //************************************************************** */
  // Pass QC → READY_FOR_PICKUP

  const passQcResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/pass`,
    )
    .send({
      notes: "Quality check passed.",
    });

  assert.equal(passQcResponse.status, 200);

  assert.equal(passQcResponse.body.data.status, "READY_FOR_PICKUP");

  return {
    agent,
    organizationId,
    repairOrderId,
  };
}

//************************************************************** */

describe("Repair order cashier guards integration", () => {
  it("rejects cashiering before the repair order is ready for pickup", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    const response = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/cashier`,
      )
      .send({
        notes: "Invalid early cashier attempt.",
      });

    assert.equal(response.status, 400);

    assert.equal(response.body.code, "REPAIR_ORDER_CASHIER_INVALID_STATUS");
  });

  //************************************************************** */

  it("rejects pickup before the repair order has been cashiered", async () => {
    const { agent, organizationId, repairOrderId } =
      await moveRepairOrderToReadyForPickup();

    const response = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/pickup`,
      )
      .send({
        notes: "Invalid pickup before cashier.",
      });

    assert.equal(response.status, 400);

    assert.equal(response.body.code, "REPAIR_ORDER_PICKUP_INVALID_STATUS");
  });

  //************************************************************** */

  it("rejects closing the repair order before customer pickup", async () => {
    const { agent, organizationId, repairOrderId } =
      await moveRepairOrderToReadyForPickup();

    //************************************************************** */
    // Cashier first

    const cashierResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/cashier`,
      )
      .send({
        notes: "Repair order cashiered.",
      });

    assert.equal(cashierResponse.status, 200);

    assert.equal(cashierResponse.body.data.status, "CASHIERED");

    //************************************************************** */
    // Close before pickup must fail

    const closeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/close`,
      )
      .send({
        notes: "Invalid close before pickup.",
      });

    assert.equal(closeResponse.status, 400);

    assert.equal(closeResponse.body.code, "REPAIR_ORDER_CLOSE_INVALID_STATUS");
  });
});
