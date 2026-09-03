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
  "Service appointment repair-order conversion integration",
  () => {
    it(
      "converts a confirmed service appointment into an ESTIMATE repair order",
      async () => {
        const fixture =
          await createServiceAppointmentFixture();

        const appointment =
          await createFixtureAppointment(
            fixture,
            {
              requestedService:
                "Replace rear tire.",

              customerComplaint:
                "Rear tire is worn beyond service limit.",

              scheduledStart:
                "2026-09-15T14:00:00.000Z",

              scheduledEnd:
                "2026-09-15T16:00:00.000Z",
            },
          );

        await confirmFixtureAppointment(
          fixture,
          appointment.id,
        );

        //************************************************************** */
        // Convert

        const conversionResponse =
          await fixture.agent.post(
            `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/convert-to-repair-order`,
          );

        assert.equal(
          conversionResponse.status,
          201,
        );

        assert.equal(
          conversionResponse.body.success,
          true,
        );

        const {
          appointment:
            convertedAppointment,

          repairOrder,
        } =
          conversionResponse.body.data;

        //************************************************************** */
        // Appointment

        assert.equal(
          convertedAppointment.id,
          appointment.id,
        );

        assert.equal(
          convertedAppointment.status,
          "CONVERTED_TO_RO",
        );

        assert.equal(
          convertedAppointment.repairOrderId,
          repairOrder.id,
        );

        //************************************************************** */
        // RO

        assert.equal(
          repairOrder.organizationId,
          fixture.organizationId,
        );

        assert.equal(
          repairOrder.customerId,
          fixture.customer.id,
        );

        assert.equal(
          repairOrder.vehicleId,
          fixture.vehicle.id,
        );

        assert.equal(
          repairOrder.status,
          "ESTIMATE",
        );

        assert.equal(
          repairOrder.complaint,
          "Rear tire is worn beyond service limit.",
        );

        assert.equal(
          new Date(
            repairOrder.scheduledDate,
          ).toISOString(),
          "2026-09-15T14:00:00.000Z",
        );

        assert.equal(
          typeof repairOrder.roNumber,
          "number",
        );

        //************************************************************** */
        // Retrieve appointment and verify persistent RO link.

        const appointmentResponse =
          await fixture.agent.get(
            `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}`,
          );

        assert.equal(
          appointmentResponse.status,
          200,
        );

        assert.equal(
          appointmentResponse.body.data.status,
          "CONVERTED_TO_RO",
        );

        assert.equal(
          appointmentResponse.body.data.repairOrder.id,
          repairOrder.id,
        );

        //************************************************************** */
        // Retrieve actual RO.

        const repairOrderResponse =
          await fixture.agent.get(
            `/api/v1/organizations/${fixture.organizationId}/repair-orders/${repairOrder.id}`,
          );

        assert.equal(
          repairOrderResponse.status,
          200,
        );

        assert.equal(
          repairOrderResponse.body.data.status,
          "ESTIMATE",
        );

        const creationHistory =
          repairOrderResponse.body.data.statusHistory.find(
            (
              history: {
                status: string;

                previousStatus:
                  | string
                  | null;
              },
            ) =>
              history.status ===
                "ESTIMATE" &&
              history.previousStatus ===
                null,
          );

        assert.notEqual(
          creationHistory,
          undefined,
        );
      },
    );

    //************************************************************** */

    it(
      "does not convert a REQUESTED appointment",
      async () => {
        const fixture =
          await createServiceAppointmentFixture();

        const appointment =
          await createFixtureAppointment(
            fixture,
          );

        const response =
          await fixture.agent.post(
            `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/convert-to-repair-order`,
          );

        assert.equal(
          response.status,
          400,
        );

        assert.equal(
          response.body.code,
          "SERVICE_APPOINTMENT_CONVERT_INVALID_STATUS",
        );
      },
    );

    //************************************************************** */

    it(
      "does not convert a walk-in appointment without a customer and vehicle",
      async () => {
        const fixture =
          await createServiceAppointmentFixture();

        const createResponse =
          await fixture.agent
            .post(
              `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments`,
            )
            .send({
              appointmentType:
                "WALK_IN",

              requestedService:
                "Walk-in inspection.",

              scheduledStart:
                "2026-09-16T14:00:00.000Z",

              scheduledEnd:
                "2026-09-16T15:00:00.000Z",
            });

        assert.equal(
          createResponse.status,
          201,
        );

        const appointment =
          createResponse.body.data;

        const confirmResponse =
          await fixture.agent.post(
            `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/confirm`,
          );

        assert.equal(
          confirmResponse.status,
          200,
        );

        const conversionResponse =
          await fixture.agent.post(
            `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/convert-to-repair-order`,
          );

        assert.equal(
          conversionResponse.status,
          400,
        );

        assert.equal(
          conversionResponse.body.code,
          "SERVICE_APPOINTMENT_CONVERT_CUSTOMER_VEHICLE_REQUIRED",
        );
      },
    );

    //************************************************************** */

    it(
      "prevents a service appointment from being converted twice",
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

        const firstResponse =
          await fixture.agent.post(
            `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/convert-to-repair-order`,
          );

        assert.equal(
          firstResponse.status,
          201,
        );

        const secondResponse =
          await fixture.agent.post(
            `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}/convert-to-repair-order`,
          );

        assert.equal(
          secondResponse.status,
          400,
        );

        assert.equal(
          secondResponse.body.code,
          "SERVICE_APPOINTMENT_CONVERT_INVALID_STATUS",
        );
      },
    );
  },
);

//************************************************************** */