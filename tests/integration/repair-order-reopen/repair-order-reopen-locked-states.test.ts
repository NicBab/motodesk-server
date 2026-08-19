import assert from "node:assert/strict";
import {
  describe,
  it,
} from "node:test";

import {
  createInProgressRepairOrderFixture,
} from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

async function moveRepairOrderToReadyForPickup() {
  const {
    agent,
    organizationId,
    repairOrderId,
    laborLineId,
  } =
    await createInProgressRepairOrderFixture();

  const completeResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes:
          "Original work completed.",
      });

  assert.equal(
    completeResponse.status,
    200,
  );

  const beginQcResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/begin`,
      )
      .send({});

  assert.equal(
    beginQcResponse.status,
    200,
  );

  const passQcResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/pass`,
      )
      .send({});

  assert.equal(
    passQcResponse.status,
    200,
  );

  assert.equal(
    passQcResponse.body.data.status,
    "READY_FOR_PICKUP",
  );

  return {
    agent,
    organizationId,
    repairOrderId,
  };
}

//************************************************************** */

describe(
  "Repair order reopen locked states integration",
  () => {
    it(
      "rejects reopening a CASHIERED repair order",
      async () => {
        const {
          agent,
          organizationId,
          repairOrderId,
        } =
          await moveRepairOrderToReadyForPickup();

        const cashierResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/cashier`,
            )
            .send({
              notes:
                "Repair order cashiered.",
            });

        assert.equal(
          cashierResponse.status,
          200,
        );

        const reopenResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/reopen`,
            )
            .send({
              notes:
                "Invalid reopen after cashier.",
            });

        assert.equal(
          reopenResponse.status,
          400,
        );

        assert.equal(
          reopenResponse.body.code,
          "REPAIR_ORDER_REOPEN_LOCKED",
        );
      },
    );

    //************************************************************** */

    it(
      "rejects reopening a PICKED_UP repair order",
      async () => {
        const {
          agent,
          organizationId,
          repairOrderId,
        } =
          await moveRepairOrderToReadyForPickup();

        const cashierResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/cashier`,
            )
            .send({});

        assert.equal(
          cashierResponse.status,
          200,
        );

        const pickupResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/pickup`,
            )
            .send({});

        assert.equal(
          pickupResponse.status,
          200,
        );

        const reopenResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/reopen`,
            )
            .send({
              notes:
                "Invalid reopen after pickup.",
            });

        assert.equal(
          reopenResponse.status,
          400,
        );

        assert.equal(
          reopenResponse.body.code,
          "REPAIR_ORDER_REOPEN_LOCKED",
        );
      },
    );

    //************************************************************** */

    it(
      "rejects reopening a CLOSED repair order",
      async () => {
        const {
          agent,
          organizationId,
          repairOrderId,
        } =
          await moveRepairOrderToReadyForPickup();

        const cashierResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/cashier`,
            )
            .send({});

        assert.equal(
          cashierResponse.status,
          200,
        );

        const pickupResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/pickup`,
            )
            .send({});

        assert.equal(
          pickupResponse.status,
          200,
        );

        const closeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/close`,
            )
            .send({});

        assert.equal(
          closeResponse.status,
          200,
        );

        const reopenResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/reopen`,
            )
            .send({
              notes:
                "Invalid reopen after close.",
            });

        assert.equal(
          reopenResponse.status,
          400,
        );

        assert.equal(
          reopenResponse.body.code,
          "REPAIR_ORDER_REOPEN_LOCKED",
        );
      },
    );

    //************************************************************** */

    it(
      "rejects reopening a CANCELLED repair order",
      async () => {
        const {
          agent,
          organizationId,
          repairOrderId,
        } =
          await createInProgressRepairOrderFixture();

        const cancelResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/status`,
            )
            .send({
              status:
                "CANCELLED",

              notes:
                "Repair order cancelled.",

              automatic:
                false,
            });

        assert.equal(
          cancelResponse.status,
          200,
        );

        assert.equal(
          cancelResponse.body.data.status,
          "CANCELLED",
        );

        const reopenResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/reopen`,
            )
            .send({
              notes:
                "Invalid reopen of cancelled repair order.",
            });

        assert.equal(
          reopenResponse.status,
          400,
        );

        assert.equal(
          reopenResponse.body.code,
          "REPAIR_ORDER_REOPEN_CANCELLED",
        );
      },
    );
  },
);