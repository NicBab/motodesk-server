import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Repair Order customer approval integration", () => {
  it("requests and records customer approval", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = Date.now().toString();

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Approval",

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

        model: "Gold Wing",

        vin: `APPROVAL-${uniqueSuffix}`,

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

        complaint: "Customer approval workflow test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    assert.equal(repairOrderResponse.body.data.status, "ESTIMATE");

    //************************************************************** */
    // Request approval

    const requestResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/request`,
      )
      .send({
        notes: "Estimate sent to customer for approval.",
      });

    assert.equal(requestResponse.status, 200);

    assert.equal(
      requestResponse.body.data.status,
      "AWAITING_CUSTOMER_APPROVAL",
    );

    //************************************************************** */
    // Approve

    const approveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/approve`,
      )
      .send({
        approvalMethod: "PHONE",

        approvedBy: "Test Customer",

        approvedAmount: 750,

        notes: "Customer approved estimate by phone.",
      });

    assert.equal(approveResponse.status, 200);

    assert.equal(approveResponse.body.data.status, "PARTS_REVIEW");

    //************************************************************** */
    // Retrieve RO and verify approval metadata

    const finalResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(finalResponse.status, 200);

    assert.equal(approveResponse.body.data.status, "PARTS_REVIEW");

    assert.equal(finalResponse.body.data.approvalMethod, "PHONE");

    assert.equal(finalResponse.body.data.approvedBy, "Test Customer");

    assert.notEqual(finalResponse.body.data.approvalDate, null);

    assert.equal(Number(finalResponse.body.data.approvedAmount), 750);

    assert.equal(
      finalResponse.body.data.approvalNotes,
      "Customer approved estimate by phone.",
    );

    //************************************************************** */
    // Verify status history

    const statuses = finalResponse.body.data.statusHistory.map(
      (history: { status: string }) => history.status,
    );

    assert.equal(statuses.includes("AWAITING_CUSTOMER_APPROVAL"), true);

    assert.equal(statuses.includes("APPROVED"), true);

    assert.equal(statuses.includes("PARTS_REVIEW"), true);
  });

  //************************************************************** */

  it("records a declined estimate and cancels the repair order", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = `${Date.now()}-decline`;

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Decline",

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

        make: "Yamaha",

        model: "MT-09",

        vin: `DECLINE-${uniqueSuffix}`,

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

        complaint: "Customer decline workflow test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Request approval

    const requestResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/request`,
      )
      .send({});

    assert.equal(requestResponse.status, 200);

    assert.equal(
      requestResponse.body.data.status,
      "AWAITING_CUSTOMER_APPROVAL",
    );

    //************************************************************** */
    // Decline

    const declineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/decline`,
      )
      .send({
        notes: "Customer declined the estimate.",
      });

    assert.equal(declineResponse.status, 200);

    assert.equal(declineResponse.body.data.status, "CANCELLED");

    //************************************************************** */
    // Verify decline notes persisted

    const finalResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(finalResponse.status, 200);

    assert.equal(finalResponse.body.data.status, "CANCELLED");

    assert.equal(
      finalResponse.body.data.approvalNotes,
      "Customer declined the estimate.",
    );
  });

  //************************************************************** */

  it("rejects approval actions from invalid repair order statuses", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = `${Date.now()}-invalid`;

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Invalid",

        lastName: "Approval",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,

        make: "Kawasaki",

        model: "Ninja 650",

        vin: `INVALID-APPROVAL-${uniqueSuffix}`,

        type: "MOTORCYCLE",
      });

    assert.equal(vehicleResponse.status, 201);

    const vehicleId = vehicleResponse.body.data.id;

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,
        vehicleId,
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Cannot approve directly from ESTIMATE

    const approveResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/approve`,
      )
      .send({
        approvalMethod: "PHONE",

        approvedBy: "Invalid Customer",
      });

    assert.equal(approveResponse.status, 400);

    assert.equal(
      approveResponse.body.code,
      "REPAIR_ORDER_APPROVAL_INVALID_STATUS",
    );

    //************************************************************** */
    // Cannot decline directly from ESTIMATE

    const declineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/decline`,
      )
      .send({
        notes: "Invalid decline attempt.",
      });

    assert.equal(declineResponse.status, 400);

    assert.equal(
      declineResponse.body.code,
      "REPAIR_ORDER_APPROVAL_DECLINE_INVALID_STATUS",
    );
  });
});
