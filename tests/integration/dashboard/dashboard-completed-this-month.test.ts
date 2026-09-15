import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";

import { describe, it } from "node:test";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Dashboard completed this month integration", () => {
  it("counts a repair order completed through the real lifecycle", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = randomUUID();

    //************************************************************** */
    // Baseline

    const baselineResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/dashboard`,
    );

    assert.equal(baselineResponse.status, 200);

    const baselineCompleted = baselineResponse.body.summary.completedThisMonth;

    //************************************************************** */
    // Customer

    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "Dashboard",

        lastName: `Completed-${suffix}`,
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

        vin: `DASH-COMPLETE-${suffix}`,

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

        complaint: "Dashboard completed-this-month integration test.",
      });

    assert.equal(repairOrderResponse.status, 201);

    const repairOrderId = repairOrderResponse.body.data.id;

    //************************************************************** */
    // Follow the production RO lifecycle.

    async function changeStatus(status: string) {
      return agent
        .post(
          `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
        )
        .send({
          status,

          automatic: false,
        });
    }

    //************************************************************** */
    // APPROVED

    const approvedResponse = await changeStatus("APPROVED");

    assert.equal(approvedResponse.status, 200);

    //************************************************************** */
    // READY_TO_WORK

    const readyResponse = await changeStatus("READY_TO_WORK");

    assert.equal(readyResponse.status, 200);

    //************************************************************** */
    // IN_PROGRESS

    const progressResponse = await changeStatus("IN_PROGRESS");

    assert.equal(progressResponse.status, 200);

    //************************************************************** */
    // WORK_COMPLETE

    const workCompleteResponse = await changeStatus("WORK_COMPLETE");

    assert.equal(workCompleteResponse.status, 200);

    //************************************************************** */
    // Begin QC

    const beginQcResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/begin`,
      )
      .send({});

    assert.equal(beginQcResponse.status, 200);

    //************************************************************** */
    // Pass QC -> READY_FOR_PICKUP

    const passQcResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/pass`,
      )
      .send({});

    assert.equal(passQcResponse.status, 200);

    assert.equal(passQcResponse.body.data.status, "READY_FOR_PICKUP");

    //************************************************************** */
    // READY_FOR_PICKUP itself should not yet increase the
    // completed-this-month Dashboard count.

    const beforeCashierResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/dashboard`,
    );

    assert.equal(beforeCashierResponse.status, 200);

    assert.equal(
      beforeCashierResponse.body.summary.completedThisMonth,
      baselineCompleted,
    );

    //************************************************************** */
    // Cashier

    const cashierResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/cashier`,
      )
      .send({
        paymentReference: `DASH-${suffix}`,

        paymentRemote: false,

        remainingBalance: 0,

        notes: "Dashboard lifecycle test cashiered.",
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
        pickupRecipient: "Dashboard Customer",

        notes: "Dashboard lifecycle test picked up.",
      });

    assert.equal(pickupResponse.status, 200);

    assert.equal(pickupResponse.body.data.status, "PICKED_UP");

    assert.ok(pickupResponse.body.data.pickupDate);

    //************************************************************** */
    // Dashboard after completion

    const dashboardResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/dashboard`,
    );

    assert.equal(dashboardResponse.status, 200);

    const dashboard = dashboardResponse.body;

    assert.equal(dashboard.summary.completedThisMonth, baselineCompleted + 1);

    //************************************************************** */
    // Completed/picked-up ROs are no longer open or in-shop.

    assert.equal(
      dashboard.recentActivity.some(
        (activity: { id: string }) => activity.id === repairOrderId,
      ),
      true,
    );
  });
});

//************************************************************** */
