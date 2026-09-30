import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

async function switchOrganization(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
) {
  const response = await agent
    .post("/api/v1/auth/switch-organization")
    .send({
      organizationId,
    });

  assert.equal(response.status, 200);

  assert.equal(response.body.success, true);
}

//************************************************************** */

async function createCustomerAndVehicle(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  suffix: string,
  label: string,
) {
  const customerResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/customers`,
    )
    .send({
      type: "INDIVIDUAL",

      firstName: label,

      lastName:
        `Appointment-Customer-${suffix}`,

      email:
        `appointment-${label.toLowerCase()}-${suffix}@motodesk.local`,

      phone:
        "3375552000",
    });

  assert.equal(
    customerResponse.status,
    201,
  );

  assert.equal(
    customerResponse.body.success,
    true,
  );

  const customer =
    customerResponse.body.data;

  //************************************************************** */

  const vehicleResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/vehicles`,
    )
    .send({
      customerId:
        customer.id,

      make:
        "Yamaha",

      model:
        "MT-09",

      year:
        2025,

      vin:
        `APPT-${label}-${suffix}`,

      type:
        "MOTORCYCLE",
    });

  assert.equal(
    vehicleResponse.status,
    201,
  );

  assert.equal(
    vehicleResponse.body.success,
    true,
  );

  return {
    customer,

    vehicle:
      vehicleResponse.body.data,
  };
}

//************************************************************** */

async function createEmployee(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  suffix: string,
  label: string,
  role:
    | "TECHNICIAN"
    | "SERVICE_ADVISOR",
) {
  const response = await agent
    .post(
      `/api/v1/organizations/${organizationId}/employees`,
    )
    .send({
      firstName:
        label,

      lastName:
        `${role}-${suffix}`,

      role,

      status:
        "ACTIVE",

      hourlyRate:
        30,

      laborRate:
        125,

      isSchedulable:
        role === "TECHNICIAN",

      dailyStartTime:
        "08:00",

      dailyEndTime:
        "17:00",

      maxDailyHours:
        8,
    });

  assert.equal(
    response.status,
    201,
  );

  assert.equal(
    response.body.success,
    true,
  );

  return response.body.data;
}

//************************************************************** */

async function createAppointment(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  customerId: string,
  vehicleId: string,
  suffix: string,
  label: string,
) {
  const response = await agent
    .post(
      `/api/v1/organizations/${organizationId}/scheduling/appointments`,
    )
    .send({
      customerId,

      vehicleId,

      appointmentType:
        "DROP_OFF",

      requestedService:
        `${label} protected scheduled maintenance ${suffix}.`,

      customerComplaint:
        `${label} tenant isolation appointment.`,

      scheduledStart:
        "2026-10-08T14:00:00.000Z",

      scheduledEnd:
        "2026-10-08T16:00:00.000Z",

      estimatedDurationMinutes:
        120,

      waitingCustomer:
        false,

      transportationNeeded:
        false,
    });

  assert.equal(
    response.status,
    201,
  );

  assert.equal(
    response.body.success,
    true,
  );

  return response.body.data;
}

//************************************************************** */

describe(
  "Service Appointment tenant isolation integration",
  () => {
    it(
      "prevents cross-organization appointment access, lifecycle actions, conversion, and foreign resource references",
      async () => {
        const {
          agent,

          organizationId:
            organizationAId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          randomUUID();

        //************************************************************** */
        // ORGANIZATION B

        const organizationBResponse =
          await agent
            .post(
              "/api/v1/organizations",
            )
            .send({
              name:
                `Appointment Tenant B ${suffix}`,

              slug:
                `appointment-tenant-b-${suffix}`,
            });

        assert.equal(
          organizationBResponse.status,
          201,
        );

        const organizationBId =
          organizationBResponse.body.data.id;

        //************************************************************** */
        // ORGANIZATION B RESOURCES

        await switchOrganization(
          agent,
          organizationBId,
        );

        const resourcesB =
          await createCustomerAndVehicle(
            agent,
            organizationBId,
            suffix,
            "B",
          );

        const technicianB =
          await createEmployee(
            agent,
            organizationBId,
            suffix,
            "B",
            "TECHNICIAN",
          );

        const advisorB =
          await createEmployee(
            agent,
            organizationBId,
            suffix,
            "B",
            "SERVICE_ADVISOR",
          );

        const appointmentB =
          await createAppointment(
            agent,
            organizationBId,
            resourcesB.customer.id,
            resourcesB.vehicle.id,
            suffix,
            "B",
          );

        //************************************************************** */
        // ORGANIZATION A RESOURCES

        await switchOrganization(
          agent,
          organizationAId,
        );

        const resourcesA =
          await createCustomerAndVehicle(
            agent,
            organizationAId,
            suffix,
            "A",
          );

        const appointmentA =
          await createAppointment(
            agent,
            organizationAId,
            resourcesA.customer.id,
            resourcesA.vehicle.id,
            suffix,
            "A",
          );

        //************************************************************** */
        // BASELINES

        const initialAppointmentB =
          await prisma.serviceAppointment.findUniqueOrThrow({
            where: {
              id:
                appointmentB.id,
            },
          });

        const initialAppointmentA =
          await prisma.serviceAppointment.findUniqueOrThrow({
            where: {
              id:
                appointmentA.id,
            },
          });

        const initialAppointmentCountA =
          await prisma.serviceAppointment.count({
            where: {
              organizationId:
                organizationAId,
            },
          });

        const initialRepairOrderCountA =
          await prisma.repairOrder.count({
            where: {
              organizationId:
                organizationAId,
            },
          });

        //************************************************************** */
        // FOREIGN APPOINTMENT READ

        const foreignReadResponse =
          await agent.get(
            `/api/v1/organizations/${organizationAId}/scheduling/appointments/${appointmentB.id}`,
          );

        assert.equal(
          foreignReadResponse.status,
          404,
        );

        assert.equal(
          foreignReadResponse.body.code,
          "SERVICE_APPOINTMENT_NOT_FOUND",
        );

        //************************************************************** */
        // LIST ISOLATION

        const listResponse =
          await agent.get(
            `/api/v1/organizations/${organizationAId}/scheduling/appointments`,
          );

        assert.equal(
          listResponse.status,
          200,
        );

        assert.equal(
          listResponse.body.success,
          true,
        );

        assert.equal(
          listResponse.body.data.some(
            (
              appointment: {
                id: string;
              },
            ) =>
              appointment.id ===
              appointmentB.id,
          ),
          false,
        );

        assert.equal(
          listResponse.body.data.some(
            (
              appointment: {
                id: string;
              },
            ) =>
              appointment.id ===
              appointmentA.id,
          ),
          true,
        );

        //************************************************************** */
        // SEARCH ISOLATION

        const searchResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationAId}/scheduling/appointments`,
            )
            .query({
              search:
                `B protected scheduled maintenance ${suffix}`,
            });

        assert.equal(
          searchResponse.status,
          200,
        );

        assert.equal(
          searchResponse.body.data.some(
            (
              appointment: {
                id: string;
              },
            ) =>
              appointment.id ===
              appointmentB.id,
          ),
          false,
        );

        //************************************************************** */
        // FOREIGN CUSTOMER REFERENCE

        const foreignCustomerResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/scheduling/appointments`,
            )
            .send({
              customerId:
                resourcesB.customer.id,

              appointmentType:
                "DROP_OFF",

              requestedService:
                "Foreign customer isolation attack.",

              scheduledStart:
                "2026-10-10T14:00:00.000Z",

              scheduledEnd:
                "2026-10-10T16:00:00.000Z",

              estimatedDurationMinutes:
                120,
            });

        assert.equal(
          foreignCustomerResponse.status,
          400,
        );

        assert.equal(
          foreignCustomerResponse.body.code,
          "SERVICE_APPOINTMENT_CUSTOMER_INVALID",
        );

        //************************************************************** */
        // FOREIGN VEHICLE REFERENCE

        const foreignVehicleResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/scheduling/appointments`,
            )
            .send({
              customerId:
                resourcesA.customer.id,

              vehicleId:
                resourcesB.vehicle.id,

              appointmentType:
                "DROP_OFF",

              requestedService:
                "Foreign vehicle isolation attack.",

              scheduledStart:
                "2026-10-10T14:00:00.000Z",

              scheduledEnd:
                "2026-10-10T16:00:00.000Z",

              estimatedDurationMinutes:
                120,
            });

        assert.equal(
          foreignVehicleResponse.status,
          400,
        );

        assert.equal(
          foreignVehicleResponse.body.code,
          "SERVICE_APPOINTMENT_VEHICLE_INVALID",
        );

        //************************************************************** */
        // FOREIGN TECHNICIAN REFERENCE

        const foreignTechnicianResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/scheduling/appointments`,
            )
            .send({
              customerId:
                resourcesA.customer.id,

              vehicleId:
                resourcesA.vehicle.id,

              appointmentType:
                "DROP_OFF",

              requestedService:
                "Foreign technician isolation attack.",

              scheduledStart:
                "2026-10-10T14:00:00.000Z",

              scheduledEnd:
                "2026-10-10T16:00:00.000Z",

              estimatedDurationMinutes:
                120,

              preferredTechnicianEmployeeId:
                technicianB.id,
            });

        assert.equal(
          foreignTechnicianResponse.status,
          400,
        );

        assert.equal(
          foreignTechnicianResponse.body.code,
          "SERVICE_APPOINTMENT_TECHNICIAN_INVALID",
        );

        //************************************************************** */
        // FOREIGN SERVICE ADVISOR REFERENCE

        const foreignAdvisorResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/scheduling/appointments`,
            )
            .send({
              customerId:
                resourcesA.customer.id,

              vehicleId:
                resourcesA.vehicle.id,

              appointmentType:
                "DROP_OFF",

              requestedService:
                "Foreign advisor isolation attack.",

              scheduledStart:
                "2026-10-10T14:00:00.000Z",

              scheduledEnd:
                "2026-10-10T16:00:00.000Z",

              estimatedDurationMinutes:
                120,

              serviceAdvisorEmployeeId:
                advisorB.id,
            });

        assert.equal(
          foreignAdvisorResponse.status,
          400,
        );

        assert.equal(
          foreignAdvisorResponse.body.code,
          "SERVICE_APPOINTMENT_ADVISOR_INVALID",
        );

        //************************************************************** */
        // FOREIGN CONFIRM

        const foreignConfirmResponse =
          await agent.post(
            `/api/v1/organizations/${organizationAId}/scheduling/appointments/${appointmentB.id}/confirm`,
          );

        assert.equal(
          foreignConfirmResponse.status,
          404,
        );

        assert.equal(
          foreignConfirmResponse.body.code,
          "SERVICE_APPOINTMENT_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN CHECK-IN

        const foreignCheckInResponse =
          await agent.post(
            `/api/v1/organizations/${organizationAId}/scheduling/appointments/${appointmentB.id}/check-in`,
          );

        assert.equal(
          foreignCheckInResponse.status,
          404,
        );

        assert.equal(
          foreignCheckInResponse.body.code,
          "SERVICE_APPOINTMENT_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN CANCEL

        const foreignCancelResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/scheduling/appointments/${appointmentB.id}/cancel`,
            )
            .send({
              reason:
                "Cross-tenant cancellation attack.",
            });

        assert.equal(
          foreignCancelResponse.status,
          404,
        );

        assert.equal(
          foreignCancelResponse.body.code,
          "SERVICE_APPOINTMENT_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN CONVERSION
        //
        // getServiceAppointmentById() executes before status validation,
        // so a foreign REQUESTED appointment must still resolve as 404.

        const foreignConvertResponse =
          await agent.post(
            `/api/v1/organizations/${organizationAId}/scheduling/appointments/${appointmentB.id}/convert-to-repair-order`,
          );

        assert.equal(
          foreignConvertResponse.status,
          404,
        );

        assert.equal(
          foreignConvertResponse.body.code,
          "SERVICE_APPOINTMENT_NOT_FOUND",
        );

        //************************************************************** */
        // REJECTED CREATE ATTACKS CREATED NOTHING

        const finalAppointmentCountA =
          await prisma.serviceAppointment.count({
            where: {
              organizationId:
                organizationAId,
            },
          });

        assert.equal(
          finalAppointmentCountA,
          initialAppointmentCountA,
        );

        //************************************************************** */
        // FOREIGN CONVERSION CREATED NO RO

        const finalRepairOrderCountA =
          await prisma.repairOrder.count({
            where: {
              organizationId:
                organizationAId,
            },
          });

        assert.equal(
          finalRepairOrderCountA,
          initialRepairOrderCountA,
        );

        //************************************************************** */
        // APPOINTMENT B REMAINS UNCHANGED

        const storedAppointmentB =
          await prisma.serviceAppointment.findUniqueOrThrow({
            where: {
              id:
                appointmentB.id,
            },
          });

        assert.equal(
          storedAppointmentB.organizationId,
          organizationBId,
        );

        assert.equal(
          storedAppointmentB.customerId,
          initialAppointmentB.customerId,
        );

        assert.equal(
          storedAppointmentB.vehicleId,
          initialAppointmentB.vehicleId,
        );

        assert.equal(
          storedAppointmentB.status,
          initialAppointmentB.status,
        );

        assert.equal(
          storedAppointmentB.repairOrderId,
          initialAppointmentB.repairOrderId,
        );

        assert.equal(
          storedAppointmentB.requestedService,
          initialAppointmentB.requestedService,
        );

        assert.equal(
          storedAppointmentB.customerComplaint,
          initialAppointmentB.customerComplaint,
        );

        assert.equal(
          storedAppointmentB.confirmedAt,
          initialAppointmentB.confirmedAt,
        );

        assert.equal(
          storedAppointmentB.checkedInAt,
          initialAppointmentB.checkedInAt,
        );

        assert.equal(
          storedAppointmentB.cancelledAt,
          initialAppointmentB.cancelledAt,
        );

        assert.equal(
          storedAppointmentB.cancelReason,
          initialAppointmentB.cancelReason,
        );

        //************************************************************** */
        // APPOINTMENT A REMAINS UNCHANGED

        const storedAppointmentA =
          await prisma.serviceAppointment.findUniqueOrThrow({
            where: {
              id:
                appointmentA.id,
            },
          });

        assert.equal(
          storedAppointmentA.organizationId,
          organizationAId,
        );

        assert.equal(
          storedAppointmentA.customerId,
          initialAppointmentA.customerId,
        );

        assert.equal(
          storedAppointmentA.vehicleId,
          initialAppointmentA.vehicleId,
        );

        assert.equal(
          storedAppointmentA.status,
          initialAppointmentA.status,
        );

        assert.equal(
          storedAppointmentA.repairOrderId,
          initialAppointmentA.repairOrderId,
        );

        //************************************************************** */
        // NO A APPOINTMENT REFERENCES CUSTOMER B

        const foreignCustomerReference =
          await prisma.serviceAppointment.findFirst({
            where: {
              organizationId:
                organizationAId,

              customerId:
                resourcesB.customer.id,
            },
          });

        assert.equal(
          foreignCustomerReference,
          null,
        );

        //************************************************************** */
        // NO A APPOINTMENT REFERENCES VEHICLE B

        const foreignVehicleReference =
          await prisma.serviceAppointment.findFirst({
            where: {
              organizationId:
                organizationAId,

              vehicleId:
                resourcesB.vehicle.id,
            },
          });

        assert.equal(
          foreignVehicleReference,
          null,
        );

        //************************************************************** */
        // NO A APPOINTMENT REFERENCES TECHNICIAN B

        const foreignTechnicianReference =
          await prisma.serviceAppointment.findFirst({
            where: {
              organizationId:
                organizationAId,

              preferredTechnicianEmployeeId:
                technicianB.id,
            },
          });

        assert.equal(
          foreignTechnicianReference,
          null,
        );

        //************************************************************** */
        // NO A APPOINTMENT REFERENCES ADVISOR B

        const foreignAdvisorReference =
          await prisma.serviceAppointment.findFirst({
            where: {
              organizationId:
                organizationAId,

              serviceAdvisorEmployeeId:
                advisorB.id,
            },
          });

        assert.equal(
          foreignAdvisorReference,
          null,
        );
      },
    );
  },
);

//************************************************************** */