import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Repair Order cashier and pickup integration", () => {
  it("cashiers, picks up, and closes a repair order through the valid lifecycle while persisting operational event data", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = Date.now().toString();

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Cashier",

        lastName: "Workflow",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    //************************************************************** */
    // Vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,

        make: "Kawasaki",

        model: "KX450",

        vin: `CASHIER-${uniqueSuffix}`,

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

        complaint: "Cashier and pickup workflow test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Move through valid workflow to READY_FOR_PICKUP

    const changeStatus = async (status: string) =>
      agent
        .post(
          `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
        )
        .send({
          status,

          automatic: false,
        });

    assert.equal((await changeStatus("APPROVED")).status, 200);

    assert.equal((await changeStatus("READY_TO_WORK")).status, 200);

    assert.equal((await changeStatus("IN_PROGRESS")).status, 200);

    assert.equal((await changeStatus("WORK_COMPLETE")).status, 200);

    //************************************************************** */
    // Begin QC

    const beginQcResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/begin`,
      )
      .send({});

    assert.equal(beginQcResponse.status, 200);

    //************************************************************** */
    // Pass QC

    const passQcResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/pass`,
      )
      .send({});

    assert.equal(passQcResponse.status, 200);

    assert.equal(passQcResponse.body.data.status, "READY_FOR_PICKUP");

    //************************************************************** */
    // Cashier

    const cashierResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/cashier`,
      )
      .send({
        paymentReference: "TEST-PAID-001",

        paymentRemote: true,

        remainingBalance: 0,

        notes: "Customer balance settled.",
      });

    assert.equal(cashierResponse.status, 200);

    const cashieredRepairOrder = cashierResponse.body.data;

    assert.equal(cashieredRepairOrder.status, "CASHIERED");

    assert.equal(cashieredRepairOrder.cashierStatus, "COMPLETED");

    assert.equal(cashieredRepairOrder.paymentReference, "TEST-PAID-001");

    assert.equal(cashieredRepairOrder.paymentRemote, true);

    assert.equal(Number(cashieredRepairOrder.remainingBalance), 0);

    assert.equal(cashieredRepairOrder.pickupStatus, "READY");

    assert.ok(cashieredRepairOrder.cashieredDate);

    const cashieredDate = new Date(cashieredRepairOrder.cashieredDate);

    assert.equal(Number.isNaN(cashieredDate.getTime()), false);

    //************************************************************** */
    // Pickup

    const pickupResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/pickup`,
      )
      .send({
        pickupRecipient: "Cashier Workflow",

        notes: "Unit released to customer.",
      });

    assert.equal(pickupResponse.status, 200);

    const pickedUpRepairOrder = pickupResponse.body.data;

    assert.equal(pickedUpRepairOrder.status, "PICKED_UP");

    assert.equal(pickedUpRepairOrder.cashierStatus, "COMPLETED");

    assert.equal(pickedUpRepairOrder.pickupStatus, "COMPLETED");

    assert.equal(pickedUpRepairOrder.pickupRecipient, "Cashier Workflow");

    assert.equal(pickedUpRepairOrder.pickupNotes, "Unit released to customer.");

    assert.ok(pickedUpRepairOrder.pickupDate);

    const pickupDate = new Date(pickedUpRepairOrder.pickupDate);

    assert.equal(Number.isNaN(pickupDate.getTime()), false);

    assert.equal(pickupDate.getTime() >= cashieredDate.getTime(), true);

    //************************************************************** */
    // Close

    const closeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/close`,
      )
      .send({
        notes: "Repair order finalized.",
      });

    assert.equal(closeResponse.status, 200);

    assert.equal(closeResponse.body.data.status, "CLOSED");

    //************************************************************** */
    // Verify persisted values after the complete lifecycle

    const finalRepairOrder = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(finalRepairOrder.status, 200);

    const finalData = finalRepairOrder.body.data;

    assert.equal(finalData.status, "CLOSED");

    assert.equal(finalData.cashierStatus, "COMPLETED");

    assert.ok(finalData.cashieredDate);

    assert.equal(finalData.paymentReference, "TEST-PAID-001");

    assert.equal(finalData.paymentRemote, true);

    assert.equal(Number(finalData.remainingBalance), 0);

    assert.equal(finalData.pickupStatus, "COMPLETED");

    assert.ok(finalData.pickupDate);

    assert.equal(finalData.pickupRecipient, "Cashier Workflow");

    assert.equal(finalData.pickupNotes, "Unit released to customer.");

    //************************************************************** */
    // Verify history

    const statuses = finalData.statusHistory.map(
      (history: { status: string }) => history.status,
    );

    assert.equal(statuses.includes("CASHIERED"), true);

    assert.equal(statuses.includes("PICKED_UP"), true);

    assert.equal(statuses.includes("CLOSED"), true);
  });

  //************************************************************** */

  it("rejects cashier, pickup, and close actions from invalid statuses", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const uniqueSuffix = `${Date.now()}-invalid`;

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Invalid",

        lastName: "Cashier",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

    //************************************************************** */
    // Vehicle

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,

        make: "Suzuki",

        model: "RM-Z450",

        vin: `INVALID-CASHIER-${uniqueSuffix}`,

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

        complaint: "Invalid cashier workflow test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Cannot cashier ESTIMATE

    const cashierResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/cashier`,
      )
      .send({});

    assert.equal(cashierResponse.status, 400);

    assert.equal(
      cashierResponse.body.code,
      "REPAIR_ORDER_CASHIER_INVALID_STATUS",
    );

    //************************************************************** */
    // Cannot pickup ESTIMATE

    const pickupResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/pickup`,
      )
      .send({});

    assert.equal(pickupResponse.status, 400);

    assert.equal(
      pickupResponse.body.code,
      "REPAIR_ORDER_PICKUP_INVALID_STATUS",
    );

    //************************************************************** */
    // Cannot close ESTIMATE

    const closeResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/close`,
      )
      .send({});

    assert.equal(closeResponse.status, 400);

    assert.equal(closeResponse.body.code, "REPAIR_ORDER_CLOSE_INVALID_STATUS");
  });
});

//************************************************************** */
