import assert from "node:assert/strict";
import {
  describe,
  it,
} from "node:test";

import {
  createAuthenticatedAgent,
} from "../helpers/authenticated-agent.js";

//************************************************************** */

async function createScheduledRepairOrder() {
  const {
    agent,
    organizationId,
  } =
    await createAuthenticatedAgent();

  const suffix =
    Date.now().toString();

  //************************************************************** */
  // Customer

  const customerResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/customers`,
      )
      .send({
        type:
          "INDIVIDUAL",
        firstName:
          "Cancel",
        lastName:
          "Schedule",
      });

  assert.equal(
    customerResponse.status,
    201,
  );

  //************************************************************** */
  // Vehicle

  const vehicleResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/vehicles`,
      )
      .send({
        customerId:
          customerResponse.body.data.id,
        make:
          "Kawasaki",
        model:
          "KX450",
        vin:
          `CANCEL-SCHEDULE-${suffix}`,
        type:
          "MOTORCYCLE",
      });

  assert.equal(
    vehicleResponse.status,
    201,
  );

  //************************************************************** */
  // Repair Order

  const repairOrderResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders`,
      )
      .send({
        customerId:
          customerResponse.body.data.id,
        vehicleId:
          vehicleResponse.body.data.id,
        complaint:
          "Schedule cancellation test.",
      });

  assert.equal(
    repairOrderResponse.status,
    201,
  );

  const repairOrderId =
    repairOrderResponse.body.data.id;

  //************************************************************** */
  // Approval Request

  const requestApprovalResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/request`,
      )
      .send({});

  assert.equal(
    requestApprovalResponse.status,
    200,
  );

  //************************************************************** */
  // Customer Approval

  const approvalResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/approve`,
      )
      .send({
        approvalMethod:
          "PHONE",
        approvedBy:
          "Cancel Schedule Customer",
      });

  assert.equal(
    approvalResponse.status,
    200,
  );

  //************************************************************** */
  // Parts Review → READY_TO_WORK

  const partsReviewResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/parts-review/complete`,
      )
      .send({});

  assert.equal(
    partsReviewResponse.status,
    200,
  );

  assert.equal(
    partsReviewResponse.body.data.status,
    "READY_TO_WORK",
  );

  //************************************************************** */
  // Schedule

  const scheduleResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/scheduling/repair-orders/${repairOrderId}`,
      )
      .send({
        scheduledDate:
          "2026-08-25T14:00:00.000Z",
        notes:
          "Initial service appointment.",
      });

  assert.equal(
    scheduleResponse.status,
    200,
  );

  return {
    agent,
    organizationId,
    repairOrderId,
    schedule:
      scheduleResponse.body.data,
  };
}

//************************************************************** */

describe(
  "Schedule cancellation integration",
  () => {
    it(
      "cancels an active schedule and returns the repair order to READY_TO_WORK",
      async () => {
        const {
          agent,
          organizationId,
          repairOrderId,
          schedule,
        } =
          await createScheduledRepairOrder();

        //************************************************************** */
        // Cancel Schedule

        const cancellationResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/scheduling/repair-orders/${repairOrderId}/cancel`,
            )
            .send({
              notes:
                "Customer requested appointment cancellation.",
            });

        assert.equal(
          cancellationResponse.status,
          200,
        );

        assert.equal(
          cancellationResponse.body.data.id,
          schedule.id,
        );

        assert.equal(
          cancellationResponse.body.data.status,
          "CANCELLED",
        );

        assert.notEqual(
          cancellationResponse.body.data.cancelledAt,
          null,
        );

        assert.equal(
          cancellationResponse.body.data.cancellationNotes,
          "Customer requested appointment cancellation.",
        );

        //************************************************************** */
        // Verify RO returned to READY_TO_WORK

        const repairOrderResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
          );

        assert.equal(
          repairOrderResponse.status,
          200,
        );

        assert.equal(
          repairOrderResponse.body.data.status,
          "READY_TO_WORK",
        );

        //************************************************************** */
        // Verify RO history

        const history =
          repairOrderResponse.body.data.statusHistory.find(
            (
              item: {
                status: string;
                previousStatus: string | null;
                automatic: boolean;
              },
            ) =>
              item.status ===
                "READY_TO_WORK" &&
              item.previousStatus ===
                "SCHEDULED" &&
              item.automatic ===
                false,
          );

        assert.notEqual(
          history,
          undefined,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects cancelling a schedule when the repair order is not SCHEDULED",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          `${Date.now()}-invalid`;

        const customerResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/customers`,
            )
            .send({
              type:
                "INDIVIDUAL",
              firstName:
                "Invalid",
              lastName:
                "Cancellation",
            });

        assert.equal(
          customerResponse.status,
          201,
        );

        const vehicleResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/vehicles`,
            )
            .send({
              customerId:
                customerResponse.body.data.id,
              make:
                "Suzuki",
              model:
                "RM-Z450",
              vin:
                `INVALID-CANCEL-${suffix}`,
              type:
                "MOTORCYCLE",
            });

        assert.equal(
          vehicleResponse.status,
          201,
        );

        const repairOrderResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders`,
            )
            .send({
              customerId:
                customerResponse.body.data.id,
              vehicleId:
                vehicleResponse.body.data.id,
            });

        assert.equal(
          repairOrderResponse.status,
          201,
        );

        //************************************************************** */
        // Still ESTIMATE

        const cancellationResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/scheduling/repair-orders/${repairOrderResponse.body.data.id}/cancel`,
            )
            .send({
              notes:
                "Invalid cancellation attempt.",
            });

        assert.equal(
          cancellationResponse.status,
          400,
        );

        assert.equal(
          cancellationResponse.body.code,
          "CANCEL_SCHEDULE_INVALID_STATUS",
        );
      },
    );
  },
);