import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInProgressRepairOrderFixture } from "../repair-order-work-status/helpers/in-progress-repair-order.fixture.js";

//************************************************************** */

describe("Repair order quality-check guards integration", () => {
  it("rejects beginning quality check before work is complete", async () => {
    const { agent, organizationId, repairOrderId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // RO is currently IN_PROGRESS.

    const beginResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/begin`,
      )
      .send({
        notes: "Invalid early QC attempt.",
      });

    assert.equal(beginResponse.status, 400);

    assert.equal(
      beginResponse.body.code,
      "REPAIR_ORDER_QC_BEGIN_INVALID_STATUS",
    );
  });

  //************************************************************** */

  it("rejects passing or failing quality check before quality check has begun", async () => {
    const { agent, organizationId, repairOrderId, laborLineId } =
      await createInProgressRepairOrderFixture();

    //************************************************************** */
    // Complete final labor → WORK_COMPLETE.

    const completionResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines/${laborLineId}/complete`,
      )
      .send({
        notes: "Work completed.",
      });

    assert.equal(completionResponse.status, 200);

    const repairOrderResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}`,
    );

    assert.equal(repairOrderResponse.status, 200);

    assert.equal(repairOrderResponse.body.data.status, "WORK_COMPLETE");

    //************************************************************** */
    // Cannot pass QC before begin-qc.

    const passResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/pass`,
      )
      .send({
        notes: "Invalid pass attempt.",
      });

    assert.equal(passResponse.status, 400);

    assert.equal(passResponse.body.code, "REPAIR_ORDER_QC_PASS_INVALID_STATUS");

    //************************************************************** */
    // Cannot fail QC before begin-qc.

    const failResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/quality-check/fail`,
      )
      .send({
        notes: "Invalid failure attempt.",
      });

    assert.equal(failResponse.status, 400);

    assert.equal(failResponse.body.code, "REPAIR_ORDER_QC_FAIL_INVALID_STATUS");
  });
});
