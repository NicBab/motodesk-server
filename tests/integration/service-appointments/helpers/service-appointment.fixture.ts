import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";

import { createAuthenticatedAgent } from "../../helpers/authenticated-agent.js";

//************************************************************** */

export async function createServiceAppointmentFixture() {
  const { agent, organizationId, membershipId } =
    await createAuthenticatedAgent();

  const suffix = randomUUID();

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/customers`)
    .send({
      type: "INDIVIDUAL",

      firstName: "Appointment",

      lastName: `Customer-${suffix}`,

      email: `appointment-${suffix}@motodesk.local`,

      phone: "3375552000",
    });

  assert.equal(customerResponse.status, 201);

  assert.equal(customerResponse.body.success, true);

  const customer = customerResponse.body.data;

  //************************************************************** */
  // Vehicle

  const vehicleResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vehicles`)
    .send({
      customerId: customer.id,

      make: "Yamaha",

      model: "MT-09",

      year: 2025,

      vin: `APPT-${suffix}`,

      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  assert.equal(vehicleResponse.body.success, true);

  const vehicle = vehicleResponse.body.data;

  //************************************************************** */

  return {
    agent,
    organizationId,
    membershipId,

    customer,
    vehicle,
  };
}

//************************************************************** */

export async function createFixtureAppointment(
  fixture: Awaited<ReturnType<typeof createServiceAppointmentFixture>>,
  overrides?: {
    appointmentType?: string;

    requestedService?: string;

    customerComplaint?: string;

    scheduledStart?: string;

    scheduledEnd?: string;

    estimatedDurationMinutes?: number;

    waitingCustomer?: boolean;

    transportationNeeded?: boolean;
  },
) {
  const response = await fixture.agent
    .post(
      `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments`,
    )
    .send({
      customerId: fixture.customer.id,

      vehicleId: fixture.vehicle.id,

      appointmentType: overrides?.appointmentType ?? "DROP_OFF",

      requestedService:
        overrides?.requestedService ?? "Perform scheduled maintenance.",

      customerComplaint:
        overrides?.customerComplaint ??
        "Customer reports routine service is due.",

      scheduledStart: overrides?.scheduledStart ?? "2026-09-10T14:00:00.000Z",

      scheduledEnd: overrides?.scheduledEnd ?? "2026-09-10T16:00:00.000Z",

      estimatedDurationMinutes: overrides?.estimatedDurationMinutes ?? 120,

      waitingCustomer: overrides?.waitingCustomer ?? false,

      transportationNeeded: overrides?.transportationNeeded ?? false,
    });

  assert.equal(response.status, 201);

  assert.equal(response.body.success, true);

  return response.body.data;
}

//************************************************************** */

export async function confirmFixtureAppointment(
  fixture: Awaited<ReturnType<typeof createServiceAppointmentFixture>>,
  appointmentId: string,
) {
  const response = await fixture.agent.post(
    `/api/v1/organizations/${fixture.organizationId}/scheduling/appointments/${appointmentId}/confirm`,
  );

  assert.equal(response.status, 200);

  assert.equal(response.body.success, true);

  return response.body.data;
}

//************************************************************** */
