import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

function createSafeSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

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

async function createSchedulingFixture(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  membershipId: string,
  suffix: string,
  label: string,
) {
  //************************************************************** */
  // Technician

  const employeeResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/employees`,
    )
    .send({
      firstName: label,

      lastName:
        `Tenant-Technician-${suffix}`,

      role: "TECHNICIAN",

      hourlyRate: 30,

      laborRate: 125,

      isSchedulable: true,

      dailyStartTime: "08:00",

      dailyEndTime: "17:00",

      maxDailyHours: 8,
    });

  assert.equal(employeeResponse.status, 201);

  const technician =
    employeeResponse.body.data;

  //************************************************************** */
  // Customer

  const customerResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/customers`,
    )
    .send({
      type: "INDIVIDUAL",

      firstName: label,

      lastName:
        `Tenant-Schedule-${suffix}`,
    });

  assert.equal(customerResponse.status, 201);

  const customer =
    customerResponse.body.data;

  //************************************************************** */
  // Vehicle

  const vehicleResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/vehicles`,
    )
    .send({
      customerId: customer.id,

      make: "Yamaha",

      model: "MT-09",

      vin:
        `SCHED-${label}-${suffix}`,

      type: "MOTORCYCLE",
    });

  assert.equal(vehicleResponse.status, 201);

  const vehicle =
    vehicleResponse.body.data;

  //************************************************************** */
  // Repair Order

  const repairOrderResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders`,
    )
    .send({
      customerId: customer.id,

      vehicleId: vehicle.id,

      complaint:
        `${label} tenant scheduling security fixture.`,
    });

  assert.equal(
    repairOrderResponse.status,
    201,
  );

  const repairOrderId =
    repairOrderResponse.body.data.id;

  //************************************************************** */
  // Labor Line

  const laborLineResponse = await agent
    .post(
      `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/labor-lines`,
    )
    .send({
      technicianMembershipId:
        membershipId,

      description:
        `${label} protected scheduling labor line`,

      hours: 2,

      rate: 125,
    });

  assert.equal(
    laborLineResponse.status,
    201,
  );

  const laborLine =
    laborLineResponse.body.data;

  //************************************************************** */
  // ESTIMATE -> APPROVAL_PENDING

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
  // APPROVAL_PENDING -> PARTS_REVIEW

  const approvalResponse =
    await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/approval/approve`,
      )
      .send({
        approvalMethod: "PHONE",

        approvedBy:
          `${label} Scheduling Customer`,
      });

  assert.equal(
    approvalResponse.status,
    200,
  );

  assert.equal(
    approvalResponse.body.data.status,
    "PARTS_REVIEW",
  );

  //************************************************************** */
  // PARTS_REVIEW -> READY_TO_WORK

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

  return {
    technician,

    customer,

    vehicle,

    repairOrder:
      partsReviewResponse.body.data,

    laborLine,
  };
}

//************************************************************** */

describe(
  "Scheduling tenant isolation integration",
  () => {
    it(
      "prevents foreign RO, technician, and labor-line scheduling while keeping the dispatch board tenant-scoped",
      async () => {
        const {
          agent,

          organizationId:
            organizationAId,

          membershipId:
            membershipAId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          createSafeSuffix();

        //************************************************************** */
        // Organization B

        const organizationBResponse =
          await agent
            .post(
              "/api/v1/organizations",
            )
            .send({
              name:
                `Scheduling Tenant B ${suffix}`,

              slug:
                `scheduling-tenant-b-${suffix}`,
            });

        assert.equal(
          organizationBResponse.status,
          201,
        );

        const organizationBId =
          organizationBResponse.body.data.id;

        //************************************************************** */
        // Membership B

        const membershipB =
          await prisma.membership.findFirstOrThrow({
            where: {
              organizationId:
                organizationBId,
            },
          });

        //************************************************************** */
        // Organization B fixture

        await switchOrganization(
          agent,
          organizationBId,
        );

        const fixtureB =
          await createSchedulingFixture(
            agent,
            organizationBId,
            membershipB.id,
            suffix,
            "B",
          );

        //************************************************************** */
        // Schedule Organization B legitimately.
        //
        // This gives the dispatch board an actual foreign work block
        // that Organization A must never see.

        const scheduleBResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationBId}/scheduling/repair-orders/${fixtureB.repairOrder.id}`,
            )
            .send({
              technicianEmployeeId:
                fixtureB.technician.id,

              laborLineId:
                fixtureB.laborLine.id,

              scheduledDate:
                "2026-10-05T14:00:00.000Z",

              scheduledEnd:
                "2026-10-05T16:00:00.000Z",

              notes:
                "Protected Organization B schedule.",
            });

        assert.equal(
          scheduleBResponse.status,
          200,
        );

        const scheduleB =
          scheduleBResponse.body.data;

        assert.equal(
          scheduleB.organizationId,
          organizationBId,
        );

        //************************************************************** */
        // Organization A fixture

        await switchOrganization(
          agent,
          organizationAId,
        );

        const fixtureA =
          await createSchedulingFixture(
            agent,
            organizationAId,
            membershipAId,
            suffix,
            "A",
          );

        //************************************************************** */
        // Capture baseline before attacks.

        const initialRepairOrderA =
          await prisma.repairOrder.findUniqueOrThrow({
            where: {
              id:
                fixtureA.repairOrder.id,
            },
          });

        assert.equal(
          initialRepairOrderA.status,
          "READY_TO_WORK",
        );

        const initialScheduleCountA =
          await prisma.schedule.count({
            where: {
              organizationId:
                organizationAId,
            },
          });

        const initialScheduleCountB =
          await prisma.schedule.count({
            where: {
              organizationId:
                organizationBId,
            },
          });

        //************************************************************** */
        // FOREIGN REPAIR ORDER
        //
        // Organization A cannot schedule Organization B's RO even with
        // an otherwise-valid Organization A technician.

        const foreignRepairOrderResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/scheduling/repair-orders/${fixtureB.repairOrder.id}`,
            )
            .send({
              technicianEmployeeId:
                fixtureA.technician.id,

              scheduledDate:
                "2026-10-06T14:00:00.000Z",

              scheduledEnd:
                "2026-10-06T16:00:00.000Z",
            });

        assert.equal(
          foreignRepairOrderResponse.status,
          404,
        );

        assert.equal(
          foreignRepairOrderResponse.body.code,
          "REPAIR_ORDER_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN TECHNICIAN
        //
        // Organization A RO + Organization B employee.

        const foreignTechnicianResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/scheduling/repair-orders/${fixtureA.repairOrder.id}`,
            )
            .send({
              technicianEmployeeId:
                fixtureB.technician.id,

              scheduledDate:
                "2026-10-06T14:00:00.000Z",

              scheduledEnd:
                "2026-10-06T16:00:00.000Z",
            });

        assert.equal(
          foreignTechnicianResponse.status,
          404,
        );

        assert.equal(
          foreignTechnicianResponse.body.code,
          "EMPLOYEE_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN LABOR LINE
        //
        // RO and technician both belong to A.
        // laborLineId belongs to B's RO.

        const foreignLaborLineResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/scheduling/repair-orders/${fixtureA.repairOrder.id}`,
            )
            .send({
              technicianEmployeeId:
                fixtureA.technician.id,

              laborLineId:
                fixtureB.laborLine.id,

              scheduledDate:
                "2026-10-06T14:00:00.000Z",

              scheduledEnd:
                "2026-10-06T16:00:00.000Z",
            });

        assert.equal(
          foreignLaborLineResponse.status,
          400,
        );

        assert.equal(
          foreignLaborLineResponse.body.code,
          "SCHEDULE_LABOR_LINE_INVALID",
        );

        //************************************************************** */
        // DATABASE INVARIANT
        //
        // Rejected attacks must not transition A's RO to SCHEDULED.

        const repairOrderAAfterAttacks =
          await prisma.repairOrder.findUniqueOrThrow({
            where: {
              id:
                fixtureA.repairOrder.id,
            },
          });

        assert.equal(
          repairOrderAAfterAttacks.organizationId,
          organizationAId,
        );

        assert.equal(
          repairOrderAAfterAttacks.status,
          "READY_TO_WORK",
        );

        assert.equal(
          repairOrderAAfterAttacks.scheduledDate,
          null,
        );

        //************************************************************** */
        // No rejected attack created an Organization A schedule.

        const scheduleCountAAfterAttacks =
          await prisma.schedule.count({
            where: {
              organizationId:
                organizationAId,
            },
          });

        assert.equal(
          scheduleCountAAfterAttacks,
          initialScheduleCountA,
        );

        //************************************************************** */
        // Organization B's legitimate schedule remains untouched.

        const storedScheduleB =
          await prisma.schedule.findUniqueOrThrow({
            where: {
              id:
                scheduleB.id,
            },
          });

        assert.equal(
          storedScheduleB.organizationId,
          organizationBId,
        );

        assert.equal(
          storedScheduleB.repairOrderId,
          fixtureB.repairOrder.id,
        );

        assert.equal(
          storedScheduleB.technicianEmployeeId,
          fixtureB.technician.id,
        );

        assert.equal(
          storedScheduleB.laborLineId,
          fixtureB.laborLine.id,
        );

        assert.equal(
          storedScheduleB.status,
          "SCHEDULED",
        );

        const scheduleCountBAfterAttacks =
          await prisma.schedule.count({
            where: {
              organizationId:
                organizationBId,
            },
          });

        assert.equal(
          scheduleCountBAfterAttacks,
          initialScheduleCountB,
        );

        //************************************************************** */
        // DISPATCH BOARD ISOLATION
        //
        // Board A must not expose B's technician, schedule, or RO.

        const boardResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationAId}/scheduling`,
            )
            .query({
              start:
                "2026-10-05T00:00:00.000Z",

              end:
                "2026-10-07T00:00:00.000Z",
            });

        assert.equal(
          boardResponse.status,
          200,
        );

        const board =
          boardResponse.body.data;

        //************************************************************** */
        // Foreign technician hidden.

        assert.equal(
          board.technicians.some(
            (
              employee: {
                id: string;
              },
            ) =>
              employee.id ===
              fixtureB.technician.id,
          ),
          false,
        );

        //************************************************************** */
        // Foreign schedule hidden.

        assert.equal(
          board.schedules.some(
            (
              schedule: {
                id: string;
              },
            ) =>
              schedule.id ===
              scheduleB.id,
          ),
          false,
        );

        //************************************************************** */
        // Foreign scheduled RO must not appear through nested schedule
        // data either.

        assert.equal(
          board.schedules.some(
            (
              schedule: {
                repairOrderId: string;
              },
            ) =>
              schedule.repairOrderId ===
              fixtureB.repairOrder.id,
          ),
          false,
        );

        //************************************************************** */
        // Foreign RO must not appear in unscheduled READY_TO_WORK list.

        assert.equal(
          board.unscheduledRepairOrders.some(
            (
              repairOrder: {
                id: string;
              },
            ) =>
              repairOrder.id ===
              fixtureB.repairOrder.id,
          ),
          false,
        );

        //************************************************************** */
        // A's legitimate local resources should still be visible.
        //
        // Technician A is schedulable.

        assert.equal(
          board.technicians.some(
            (
              employee: {
                id: string;
              },
            ) =>
              employee.id ===
              fixtureA.technician.id,
          ),
          true,
        );

        //************************************************************** */
        // RO A remains READY_TO_WORK and unscheduled, so it should be
        // available on A's board.

        assert.equal(
          board.unscheduledRepairOrders.some(
            (
              repairOrder: {
                id: string;
              },
            ) =>
              repairOrder.id ===
              fixtureA.repairOrder.id,
          ),
          true,
        );

        //************************************************************** */
        // Explicit database cross-tenant invariants.

        const crossTenantTechnicianSchedule =
          await prisma.schedule.findFirst({
            where: {
              organizationId:
                organizationAId,

              technicianEmployeeId:
                fixtureB.technician.id,
            },
          });

        assert.equal(
          crossTenantTechnicianSchedule,
          null,
        );

        const crossTenantRepairOrderSchedule =
          await prisma.schedule.findFirst({
            where: {
              organizationId:
                organizationAId,

              repairOrderId:
                fixtureB.repairOrder.id,
            },
          });

        assert.equal(
          crossTenantRepairOrderSchedule,
          null,
        );

        const crossTenantLaborLineSchedule =
          await prisma.schedule.findFirst({
            where: {
              organizationId:
                organizationAId,

              laborLineId:
                fixtureB.laborLine.id,
            },
          });

        assert.equal(
          crossTenantLaborLineSchedule,
          null,
        );
      },
    );
  },
);

//************************************************************** */