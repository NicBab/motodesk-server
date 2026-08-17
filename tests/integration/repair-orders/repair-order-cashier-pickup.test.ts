import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Repair Order cashier and pickup integration", () => {
  it("cashiers, picks up, and closes a repair order through the valid lifecycle", async () => {
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
        notes: "Customer balance settled.",
      });

    assert.equal(cashierResponse.status, 200);

    assert.equal(cashierResponse.body.data.status, "CASHIERED");

    //************************************************************** */
    // Pickup

    const pickupResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/pickup`,
      )
      .send({
        notes: "Unit released to customer.",
      });

    assert.equal(pickupResponse.status, 200);

    assert.equal(pickupResponse.body.data.status, "PICKED_UP");

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
    // Verify history

    const finalRepairOrder = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(finalRepairOrder.status, 200);

    const statuses = finalRepairOrder.body.data.statusHistory.map(
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

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Invalid",

        lastName: "Cashier",
      });

    assert.equal(customerResponse.status, 201);

    const customerId = customerResponse.body.data.id;

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
