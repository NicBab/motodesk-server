import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Repair Order integration", () => {
  it("creates, retrieves, updates, lists, and changes status with history", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    //************************************************************** */
    // Create customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Repair",
        lastName: "Customer",
        email: "repair.customer@motodesk.local",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    //************************************************************** */
    // Create vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,
        year: 2024,
        make: "Honda",
        model: "CRF450R",
        vin: `RO-VIN-${Date.now()}`,
        type: "MOTORCYCLE",
        classification: "SERVICE",
        inventoryStatus: "AVAILABLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    //************************************************************** */
    // Create repair order

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,
        vehicleId,
        complaint: "Customer reports hard starting when hot.",
        priority: "STANDARD",
        shopSuppliesRate: 6,
      });

    assert.equal(createResponse.status, 201);

    assert.equal(createResponse.body.success, true);

    const repairOrderId = createResponse.body.data.id;

    const roNumber = createResponse.body.data.roNumber;

    assert.equal(typeof repairOrderId, "string");

    assert.equal(typeof roNumber, "number");

    assert.equal(createResponse.body.data.status, "ESTIMATE");

    assert.equal(createResponse.body.data.statusHistory.length, 1);

    assert.equal(createResponse.body.data.statusHistory[0].status, "ESTIMATE");

    //************************************************************** */
    // Get repair order

    const getResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(getResponse.status, 200);

    assert.equal(getResponse.body.data.id, repairOrderId);

    assert.equal(getResponse.body.data.customerId, customerId);

    assert.equal(getResponse.body.data.vehicleId, vehicleId);

    //************************************************************** */
    // Update repair order

    const updateResponse = await agent
      .patch(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
      )
      .send({
        priority: "RUSH",
        notes: "Customer requested expedited service.",
      });

    assert.equal(updateResponse.status, 200);

    assert.equal(updateResponse.body.data.priority, "RUSH");

    assert.equal(
      updateResponse.body.data.notes,
      "Customer requested expedited service.",
    );

    //************************************************************** */
    // Change status

    const statusResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
      )
      .send({
        status: "AWAITING_CUSTOMER_APPROVAL",
        notes: "Estimate ready for customer review.",
        automatic: false,
      });

    assert.equal(statusResponse.status, 200);

    assert.equal(statusResponse.body.data.status, "AWAITING_CUSTOMER_APPROVAL");

    assert.equal(statusResponse.body.data.statusHistory.length, 2);

    const latestHistory =
      statusResponse.body.data.statusHistory[
        statusResponse.body.data.statusHistory.length - 1
      ];

    assert.equal(latestHistory.previousStatus, "ESTIMATE");

    assert.equal(latestHistory.status, "AWAITING_CUSTOMER_APPROVAL");

    //************************************************************** */
    // Reject unchanged status

    const duplicateStatusResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
      )
      .send({
        status: "AWAITING_CUSTOMER_APPROVAL",
      });

    assert.equal(duplicateStatusResponse.status, 400);

    assert.equal(
      duplicateStatusResponse.body.code,
      "REPAIR_ORDER_STATUS_UNCHANGED",
    );

    //************************************************************** */
    // List + search

    const listResponse = await agent
      .get(`/api/v1/organizations/${organizationId}/repair-orders`)
      .query({
        search: "hard starting",
        priority: "RUSH",
        status: "AWAITING_CUSTOMER_APPROVAL",
      });

    assert.equal(listResponse.status, 200);

    assert.equal(listResponse.body.success, true);

    const repairOrderFound = listResponse.body.data.some(
      (repairOrder: { id: string }) => repairOrder.id === repairOrderId,
    );

    assert.equal(repairOrderFound, true);
  });

  //************************************************************** */

  it("allocates unique sequential RO numbers within an organization", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",
        firstName: "Sequence",
        lastName: "Customer",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,
        make: "Yamaha",
        model: "MT-09",
        vin: `SEQ-VIN-${Date.now()}`,
        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    const firstResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,
        vehicleId,
      });

    assert.equal(firstResponse.status, 201);

    const secondResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,
        vehicleId,
      });

    assert.equal(secondResponse.status, 201);

    const firstRoNumber = firstResponse.body.data.roNumber;

    const secondRoNumber = secondResponse.body.data.roNumber;

    assert.equal(typeof firstRoNumber, "number");

    assert.equal(typeof secondRoNumber, "number");

    assert.notEqual(secondRoNumber, firstRoNumber);

    assert.equal(secondRoNumber > firstRoNumber, true);
  });
});
