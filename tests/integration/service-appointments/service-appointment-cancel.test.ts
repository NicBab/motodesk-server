import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
  createFixtureAppointment,
  createServiceAppointmentFixture,
} from "./helpers/service-appointment.fixture.js";

//************************************************************** */

describe("Service appointment cancellation integration", () => {
  it("cancels an active service appointment with a reason", async () => {
    const fixture = await createServiceAppointmentFixture();

    const appointment = await createFixtureAppointment(fixture);

    const response = await fixture.agent
      .post(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/cancel`,
      )
      .send({
        reason: "Customer requested cancellation.",
      });

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    assert.equal(response.body.data.status, "CANCELLED");

    assert.equal(
      response.body.data.cancelReason,
      "Customer requested cancellation.",
    );

    assert.notEqual(response.body.data.cancelledAt, null);
  });

  //************************************************************** */

  it("does not allow a cancelled appointment to be cancelled again", async () => {
    const fixture = await createServiceAppointmentFixture();

    const appointment = await createFixtureAppointment(fixture);

    const firstResponse = await fixture.agent
      .post(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/cancel`,
      )
      .send({
        reason: "First cancellation.",
      });

    assert.equal(firstResponse.status, 200);

    const secondResponse = await fixture.agent
      .post(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/cancel`,
      )
      .send({
        reason: "Second cancellation.",
      });

    assert.equal(secondResponse.status, 400);

    assert.equal(
      secondResponse.body.code,
      "SERVICE_APPOINTMENT_CANCEL_INVALID_STATUS",
    );
  });
});

//************************************************************** */
