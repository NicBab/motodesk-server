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

async function createEmployee(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  suffix: string,
  label: string,
) {
  const response = await agent
    .post(
      `/api/v1/organizations/${organizationId}/employees`,
    )
    .send({
      firstName: label,

      lastName:
        `Time-Clock-${suffix}`,

      role: "TECHNICIAN",

      pin: "4826",

      hourlyRate: 30,

      laborRate: 125,
    });

  assert.equal(response.status, 201);

  return response.body.data;
}

//************************************************************** */

describe(
  "Time Clock tenant isolation integration",
  () => {
    it(
      "prevents foreign employee and time-entry access, mutation, reporting, and kiosk actions",
      async () => {
        const {
          agent,
          organizationId: organizationAId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          createSafeSuffix();

        //************************************************************** */
        // ORGANIZATION B

        const organizationBResponse =
          await agent
            .post("/api/v1/organizations")
            .send({
              name:
                `Time Clock Tenant B ${suffix}`,

              slug:
                `time-clock-tenant-b-${suffix}`,
            });

        assert.equal(
          organizationBResponse.status,
          201,
        );

        const organizationBId =
          organizationBResponse.body.data.id;

        //************************************************************** */
        // ORGANIZATION B EMPLOYEE

        await switchOrganization(
          agent,
          organizationBId,
        );

        const employeeB =
          await createEmployee(
            agent,
            organizationBId,
            suffix,
            "B",
          );

        //************************************************************** */
        // Create legitimate B time entry.

        const manualEntryBResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationBId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                employeeB.id,

              clockInAt:
                "2026-09-15T08:00:00.000Z",

              clockOutAt:
                "2026-09-15T17:00:00.000Z",

              breakMinutes:
                30,

              notes:
                "Protected Organization B entry.",

              reason:
                "Tenant isolation fixture.",
            });

        assert.equal(
          manualEntryBResponse.status,
          201,
        );

        const entryB =
          manualEntryBResponse.body.data;

        //************************************************************** */
        // Also clock B employee in so current-list isolation is tested.

        const clockInBResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationBId}/time-clock/employees/${employeeB.id}/clock-in`,
            )
            .send({
              pin: "4826",
            });

        assert.equal(
          clockInBResponse.status,
          201,
        );

        const activeEntryB =
          clockInBResponse.body.data;

        //************************************************************** */
        // ORGANIZATION A EMPLOYEE

        await switchOrganization(
          agent,
          organizationAId,
        );

        const employeeA =
          await createEmployee(
            agent,
            organizationAId,
            suffix,
            "A",
          );

        //************************************************************** */
        // BASELINES

        const initialEntryB =
          await prisma.employeeTimeEntry.findUniqueOrThrow({
            where: {
              id:
                entryB.id,
            },
          });

        const initialActiveEntryB =
          await prisma.employeeTimeEntry.findUniqueOrThrow({
            where: {
              id:
                activeEntryB.id,
            },
          });

        const initialEntryCountA =
          await prisma.employeeTimeEntry.count({
            where: {
              organizationId:
                organizationAId,
            },
          });

        //************************************************************** */
        // FOREIGN EMPLOYEE STATUS

        const foreignStatusResponse =
          await agent.get(
            `/api/v1/organizations/${organizationAId}/time-clock/employees/${employeeB.id}/status`,
          );

        assert.equal(
          foreignStatusResponse.status,
          404,
        );

        //************************************************************** */
        // FOREIGN EMPLOYEE HISTORY

        const foreignHistoryResponse =
          await agent.get(
            `/api/v1/organizations/${organizationAId}/time-clock/employees/${employeeB.id}/history`,
          );

        assert.equal(
          foreignHistoryResponse.status,
          404,
        );

        //************************************************************** */
        // FOREIGN CLOCK-IN
        //
        // Even knowing B's valid PIN cannot allow A to operate B's
        // employee record.

        const foreignClockInResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/time-clock/employees/${employeeB.id}/clock-in`,
            )
            .send({
              pin: "4826",
            });

        assert.equal(
          foreignClockInResponse.status,
          404,
        );

        //************************************************************** */
        // FOREIGN CLOCK-OUT

        const foreignClockOutResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/time-clock/employees/${employeeB.id}/clock-out`,
            )
            .send({
              pin: "4826",
            });

        assert.equal(
          foreignClockOutResponse.status,
          404,
        );

        //************************************************************** */
        // FOREIGN EMPLOYEE — MANUAL ENTRY

        const foreignManualEntryResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                employeeB.id,

              clockInAt:
                "2026-09-16T08:00:00.000Z",

              clockOutAt:
                "2026-09-16T17:00:00.000Z",

              breakMinutes:
                30,

              notes:
                "Cross-tenant manual entry attack.",

              reason:
                "Tenant isolation test.",
            });

        assert.equal(
          foreignManualEntryResponse.status,
          404,
        );

        assert.equal(
          foreignManualEntryResponse.body.code,
          "TIME_CLOCK_EMPLOYEE_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN TIME ENTRY — CORRECTION

        const foreignCorrectionResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationAId}/time-clock/entries/${entryB.id}/correction`,
            )
            .send({
              notes:
                "CROSS TENANT MUTATION",

              breakMinutes:
                999,

              reason:
                "Cross-tenant correction attack.",
            });

        assert.equal(
          foreignCorrectionResponse.status,
          404,
        );

        assert.equal(
          foreignCorrectionResponse.body.code,
          "TIME_ENTRY_NOT_FOUND",
        );

        //************************************************************** */
        // CURRENT CLOCKED-IN LIST ISOLATION

        const currentResponse =
          await agent.get(
            `/api/v1/organizations/${organizationAId}/time-clock/current`,
          );

        assert.equal(
          currentResponse.status,
          200,
        );

        assert.equal(
          currentResponse.body.data.some(
            (
              entry: {
                employeeId: string;
              },
            ) =>
              entry.employeeId ===
              employeeB.id,
          ),
          false,
        );

        //************************************************************** */
        // FOREIGN EMPLOYEE REPORT FILTER

        const foreignReportResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationAId}/time-clock/report`,
            )
            .query({
              range:
                "MONTHLY",

              employeeId:
                employeeB.id,

              anchorDate:
                "2026-09-15",
            });

        assert.equal(
          foreignReportResponse.status,
          404,
        );

        //************************************************************** */
        // LOCAL EMPLOYEE STILL WORKS
        //
        // This confirms we're testing tenant isolation rather than a
        // generally broken Time Clock endpoint.

        const localStatusResponse =
          await agent.get(
            `/api/v1/organizations/${organizationAId}/time-clock/employees/${employeeA.id}/status`,
          );

        assert.equal(
          localStatusResponse.status,
          200,
        );

        assert.equal(
          localStatusResponse.body.data.employee.id,
          employeeA.id,
        );

        //************************************************************** */
        // REJECTED ATTACKS CREATED NO A ENTRIES

        const finalEntryCountA =
          await prisma.employeeTimeEntry.count({
            where: {
              organizationId:
                organizationAId,
            },
          });

        assert.equal(
          finalEntryCountA,
          initialEntryCountA,
        );

        //************************************************************** */
        // B MANUAL ENTRY UNCHANGED

        const storedEntryB =
          await prisma.employeeTimeEntry.findUniqueOrThrow({
            where: {
              id:
                entryB.id,
            },
          });

        assert.equal(
          storedEntryB.organizationId,
          organizationBId,
        );

        assert.equal(
          storedEntryB.employeeId,
          employeeB.id,
        );

        assert.equal(
          storedEntryB.clockInAt.getTime(),
          initialEntryB.clockInAt.getTime(),
        );

        assert.equal(
          storedEntryB.clockOutAt?.getTime(),
          initialEntryB.clockOutAt?.getTime(),
        );

        assert.equal(
          storedEntryB.breakMinutes,
          initialEntryB.breakMinutes,
        );

        assert.equal(
          storedEntryB.workedMinutes,
          initialEntryB.workedMinutes,
        );

        assert.equal(
          storedEntryB.notes,
          initialEntryB.notes,
        );

        //************************************************************** */
        // B ACTIVE ENTRY REMAINS CLOCKED IN
        //
        // The foreign clock-out attempt must not have touched it.

        const storedActiveEntryB =
          await prisma.employeeTimeEntry.findUniqueOrThrow({
            where: {
              id:
                activeEntryB.id,
            },
          });

        assert.equal(
          storedActiveEntryB.organizationId,
          organizationBId,
        );

        assert.equal(
          storedActiveEntryB.employeeId,
          employeeB.id,
        );

        assert.equal(
          storedActiveEntryB.status,
          initialActiveEntryB.status,
        );

        assert.equal(
          storedActiveEntryB.status,
          "CLOCKED_IN",
        );

        assert.equal(
          storedActiveEntryB.clockOutAt,
          null,
        );

        //************************************************************** */
        // NO A ENTRY MAY REFERENCE EMPLOYEE B

        const crossTenantEmployeeEntry =
          await prisma.employeeTimeEntry.findFirst({
            where: {
              organizationId:
                organizationAId,

              employeeId:
                employeeB.id,
            },
          });

        assert.equal(
          crossTenantEmployeeEntry,
          null,
        );
      },
    );
  },
);

//************************************************************** */