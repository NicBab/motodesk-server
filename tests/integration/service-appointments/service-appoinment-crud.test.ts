import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
  createFixtureAppointment,
  createServiceAppointmentFixture,
} from "./helpers/service-appointment.fixture.js";

//************************************************************** */

describe("Service appointment creation and retrieval integration", () => {
  it("creates, retrieves, lists, searches, and filters service appointments", async () => {
    const fixture = await createServiceAppointmentFixture();

    const appointment = await createFixtureAppointment(fixture, {
      appointmentType: "WAITING_CUSTOMER",

      requestedService: "Replace front tire and inspect brakes.",

      customerComplaint: "Front tire is worn.",

      waitingCustomer: true,
    });

    //************************************************************** */
    // Create assertions

    assert.equal(appointment.organizationId, fixture.organizationId);

    assert.equal(appointment.customerId, fixture.customer.id);

    assert.equal(appointment.vehicleId, fixture.vehicle.id);

    assert.equal(appointment.status, "REQUESTED");

    assert.equal(appointment.appointmentType, "WAITING_CUSTOMER");

    assert.equal(appointment.waitingCustomer, true);

    assert.equal(
      appointment.requestedService,
      "Replace front tire and inspect brakes.",
    );

    assert.equal(typeof appointment.appointmentNumber, "number");

    assert.equal(appointment.appointmentNumber >= 1001, true);

    //************************************************************** */
    // Get

    const getResponse = await fixture.agent.get(
      `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointment.id}`,
    );

    assert.equal(getResponse.status, 200);

    assert.equal(getResponse.body.success, true);

    assert.equal(getResponse.body.data.id, appointment.id);

    //************************************************************** */
    // Search by service

    const searchResponse = await fixture.agent
      .get(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments`,
      )
      .query({
        search: "front tire",
      });

    assert.equal(searchResponse.status, 200);

    assert.equal(searchResponse.body.success, true);

    const searchMatch = searchResponse.body.data.some(
      (item: { id: string }) => item.id === appointment.id,
    );

    assert.equal(searchMatch, true);

    //************************************************************** */
    // Filter by status

    const statusResponse = await fixture.agent
      .get(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments`,
      )
      .query({
        status: "REQUESTED",
      });

    assert.equal(statusResponse.status, 200);

    const statusMatch = statusResponse.body.data.some(
      (item: { id: string }) => item.id === appointment.id,
    );

    assert.equal(statusMatch, true);

    //************************************************************** */
    // Filter by date

    const dateResponse = await fixture.agent
      .get(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments`,
      )
      .query({
        start: "2026-09-10T00:00:00.000Z",

        end: "2026-09-11T00:00:00.000Z",
      });

    assert.equal(dateResponse.status, 200);

    const dateMatch = dateResponse.body.data.some(
      (item: { id: string }) => item.id === appointment.id,
    );

    assert.equal(dateMatch, true);
  });

  //************************************************************** */

  it("creates a walk-in appointment without requiring a customer or vehicle", async () => {
    const fixture = await createServiceAppointmentFixture();

    const response = await fixture.agent
      .post(
        `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments`,
      )
      .send({
        appointmentType: "WALK_IN",

        requestedService: "Walk-in service request.",

        scheduledStart: "2026-09-11T14:00:00.000Z",

        scheduledEnd: "2026-09-11T15:00:00.000Z",

        estimatedDurationMinutes: 60,
      });

    assert.equal(response.status, 201);

    assert.equal(response.body.data.customerId, null);

    assert.equal(response.body.data.vehicleId, null);

    assert.equal(response.body.data.customerName, "Walk-in");

    assert.equal(response.body.data.status, "REQUESTED");
  });
});

//************************************************************** */
