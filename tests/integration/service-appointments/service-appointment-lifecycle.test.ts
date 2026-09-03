import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import {
  confirmFixtureAppointment,
  createFixtureAppointment,
  createServiceAppointmentFixture,
} from "./helpers/service-appointment.fixture.js";

//************************************************************** */

describe(
  "Service appointment lifecycle integration",
  () => {
    it(
      "moves an appointment from REQUESTED to CONFIRMED to CHECKED_IN",
      async () => {
        const fixture =
          await createServiceAppointmentFixture();

        const appointment =
          await createFixtureAppointment(
            fixture,
          );

        assert.equal(
          appointment.status,
          "REQUESTED",
        );

        //************************************************************** */
        // Confirm

        const confirmed =
          await confirmFixtureAppointment(
            fixture,
            appointment.id,
          );

        assert.equal(
          confirmed.status,
          "CONFIRMED",
        );

        assert.notEqual(
          confirmed.confirmedAt,
          null,
        );

        //************************************************************** */
        // Check In

        const checkInResponse =
          await fixture.agent.post(
            `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/check-in`,
          );

        assert.equal(
          checkInResponse.status,
          200,
        );

        assert.equal(
          checkInResponse.body.success,
          true,
        );

        assert.equal(
          checkInResponse.body.data.status,
          "CHECKED_IN",
        );

        assert.notEqual(
          checkInResponse.body.data.checkedInAt,
          null,
        );
      },
    );

    //************************************************************** */

    it(
      "does not allow an unconfirmed appointment to be checked in",
      async () => {
        const fixture =
          await createServiceAppointmentFixture();

        const appointment =
          await createFixtureAppointment(
            fixture,
          );

        const response =
          await fixture.agent.post(
            `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/check-in`,
          );

        assert.equal(
          response.status,
          400,
        );

        assert.equal(
          response.body.code,
          "SERVICE_APPOINTMENT_CHECK_IN_INVALID_STATUS",
        );
      },
    );

    //************************************************************** */

    it(
      "does not allow an appointment to be confirmed twice",
      async () => {
        const fixture =
          await createServiceAppointmentFixture();

        const appointment =
          await createFixtureAppointment(
            fixture,
          );

        await confirmFixtureAppointment(
          fixture,
          appointment.id,
        );

        const response =
          await fixture.agent.post(
            `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/confirm`,
          );

        assert.equal(
          response.status,
          400,
        );

        assert.equal(
          response.body.code,
          "SERVICE_APPOINTMENT_CONFIRM_INVALID_STATUS",
        );
      },
    );
  },
);

//************************************************************** */