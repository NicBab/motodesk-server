import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order reopen guards integration", () => {
  it("rejects reopening a repair order that is already IN_PROGRESS", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    const response = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/reopen`,
      )
      .send({
        notes: "Invalid reopen attempt.",
      });

    assert.equal(response.status, 400);

    assert.equal(response.body.code, "REPAIR_ORDER_REOPEN_ALREADY_IN_PROGRESS");
  });
});
