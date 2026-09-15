import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { createPurchaseOrderFixture } from "../purchase-orders/helpers/purchase-order-fixture.js";

//************************************************************** */

describe("Dashboard expected deliveries integration", () => {
  it("returns ordered purchase orders with future expected delivery dates", async () => {
    const fixture = await createPurchaseOrderFixture({
      orderedQty: 3,

      qtyOnHand: 0,
    });

    const { agent, organizationId, purchaseOrderId, vendorId } = fixture;

    //************************************************************** */
    // Baseline

    const baselineResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/dashboard`,
    );

    assert.equal(baselineResponse.status, 200);

    const baselineIds = new Set<string>(
      baselineResponse.body.expectedDeliveries.map(
        (delivery: { id: string }) => delivery.id,
      ),
    );

    assert.equal(baselineIds.has(purchaseOrderId), false);

    //************************************************************** */
    // Set future expected delivery date while PO is still DRAFT.

    const expectedAt = new Date();

    expectedAt.setDate(expectedAt.getDate() + 7);

    expectedAt.setHours(12, 0, 0, 0);

    const updateResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}`,
      )
      .send({
        expectedAt: expectedAt.toISOString(),
      });

    assert.equal(updateResponse.status, 200);

    assert.equal(updateResponse.body.success, true);

    assert.equal(updateResponse.body.data.id, purchaseOrderId);

    assert.equal(updateResponse.body.data.vendorId, vendorId);

    assert.ok(updateResponse.body.data.expectedAt);

    //************************************************************** */
    // DRAFT POs must not appear as expected deliveries.

    const draftDashboardResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/dashboard`,
    );

    assert.equal(draftDashboardResponse.status, 200);

    const draftDelivery = draftDashboardResponse.body.expectedDeliveries.find(
      (delivery: { id: string }) => delivery.id === purchaseOrderId,
    );

    assert.equal(draftDelivery, undefined);

    //************************************************************** */
    // Order PO through the real lifecycle endpoint.

    const orderResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/purchase-orders/${purchaseOrderId}/order`,
    );

    assert.equal(orderResponse.status, 200);

    assert.equal(orderResponse.body.data.status, "ORDERED");

    assert.ok(orderResponse.body.data.orderedAt);

    //************************************************************** */
    // Dashboard

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/dashboard`,
    );

    assert.equal(response.status, 200);

    const dashboard = response.body;

    assert.ok(Array.isArray(dashboard.expectedDeliveries));

    //************************************************************** */
    // Expected delivery

    const delivery = dashboard.expectedDeliveries.find(
      (item: { id: string }) => item.id === purchaseOrderId,
    );

    assert.ok(delivery);

    assert.equal(delivery.id, purchaseOrderId);

    assert.equal(delivery.vendorId, vendorId);

    assert.equal(delivery.status, "ORDERED");

    assert.ok(delivery.vendorName);

    assert.equal(typeof delivery.vendorName, "string");

    assert.ok(delivery.orderedAt);

    assert.ok(delivery.expectedAt);

    //************************************************************** */
    // One PO line with 3 ordered and none received.

    assert.equal(delivery.lineCount, 1);

    assert.equal(delivery.remainingQuantity, 3);

    //************************************************************** */
    // Verify returned expected date represents the date persisted
    // through the actual PO update endpoint.

    assert.equal(new Date(delivery.expectedAt).getTime(), expectedAt.getTime());
  });
});

//************************************************************** */
