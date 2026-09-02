import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import {
  createAuthenticatedAgent,
} from "../helpers/authenticated-agent.js";

//************************************************************** */

describe(
  "Time and Attendance reporting integration",
  () => {
    it(
      "returns weekly organization attendance totals and employee summaries",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          Date.now().toString();

        //************************************************************** */
        // Employees

        const employeeOneResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                "Weekly",

              lastName:
                `Tech-${suffix}`,

              role:
                "TECHNICIAN",

              hourlyRate:
                30,
            });

        assert.equal(
          employeeOneResponse.status,
          201,
        );

        const employeeOne =
          employeeOneResponse.body.data;

        const employeeTwoResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                "Weekly",

              lastName:
                `Advisor-${suffix}`,

              role:
                "SERVICE_ADVISOR",

              hourlyRate:
                25,
            });

        assert.equal(
          employeeTwoResponse.status,
          201,
        );

        const employeeTwo =
          employeeTwoResponse.body.data;

        //************************************************************** */
        // Employee one:
        //
        // 08:00 → 17:00
        // minus 30 = 510 minutes.

        const firstEntryResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                employeeOne.id,

              clockInAt:
                "2026-09-01T08:00:00.000Z",

              clockOutAt:
                "2026-09-01T17:00:00.000Z",

              breakMinutes:
                30,

              reason:
                "Weekly report integration setup.",
            });

        assert.equal(
          firstEntryResponse.status,
          201,
        );

        //************************************************************** */
        // Employee one second shift:
        //
        // 08:00 → 16:00
        // minus 30 = 450 minutes.

        const secondEntryResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                employeeOne.id,

              clockInAt:
                "2026-09-02T08:00:00.000Z",

              clockOutAt:
                "2026-09-02T16:00:00.000Z",

              breakMinutes:
                30,

              reason:
                "Weekly report integration setup.",
            });

        assert.equal(
          secondEntryResponse.status,
          201,
        );

        //************************************************************** */
        // Employee two:
        //
        // 09:00 → 17:00
        // minus 60 = 420 minutes.

        const thirdEntryResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                employeeTwo.id,

              clockInAt:
                "2026-09-03T09:00:00.000Z",

              clockOutAt:
                "2026-09-03T17:00:00.000Z",

              breakMinutes:
                60,

              reason:
                "Weekly report integration setup.",
            });

        assert.equal(
          thirdEntryResponse.status,
          201,
        );

        //************************************************************** */
        // Weekly report

        const reportResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/time-clock/report`,
          )
            .query({
              range:
                "WEEKLY",

              anchorDate:
                "2026-09-02T12:00:00.000Z",

              includeInactive:
                "false",
            });

        assert.equal(
          reportResponse.status,
          200,
        );

        assert.equal(
          reportResponse.body.success,
          true,
        );

        const report =
          reportResponse.body.data;

        assert.equal(
          report.range,
          "WEEKLY",
        );

        assert.equal(
          report.summary.entryCount,
          3,
        );

        assert.equal(
          report.summary.completedEntries,
          3,
        );

        assert.equal(
          report.summary.activeEntries,
          0,
        );

        assert.equal(
          report.summary.manualEntries,
          3,
        );

        assert.equal(
          report.summary.workedMinutes,
          1380,
        );

        assert.equal(
          report.summary.workedHours,
          23,
        );

        assert.equal(
          report.summary.breakMinutes,
          120,
        );

        assert.equal(
          report.summary.breakHours,
          2,
        );

        assert.equal(
          report.summary.employeeCount,
          2,
        );

        //************************************************************** */
        // Employee summaries

        const techSummary =
          report.employeeSummary.find(
            (
              item: {
                employeeId: string;
              },
            ) =>
              item.employeeId ===
              employeeOne.id,
          );

        assert.ok(
          techSummary,
        );

        assert.equal(
          techSummary.entryCount,
          2,
        );

        assert.equal(
          techSummary.workedMinutes,
          960,
        );

        assert.equal(
          techSummary.workedHours,
          16,
        );

        const advisorSummary =
          report.employeeSummary.find(
            (
              item: {
                employeeId: string;
              },
            ) =>
              item.employeeId ===
              employeeTwo.id,
          );

        assert.ok(
          advisorSummary,
        );

        assert.equal(
          advisorSummary.entryCount,
          1,
        );

        assert.equal(
          advisorSummary.workedMinutes,
          420,
        );

        assert.equal(
          advisorSummary.workedHours,
          7,
        );
      },
    );

    //************************************************************** */

    it(
      "supports daily, monthly, annual, and employee-specific report ranges",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          Date.now().toString();

        const firstEmployeeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                "Range",

              lastName:
                `One-${suffix}`,

              role:
                "TECHNICIAN",
            });

        assert.equal(
          firstEmployeeResponse.status,
          201,
        );

        const firstEmployee =
          firstEmployeeResponse.body.data;

        const secondEmployeeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                "Range",

              lastName:
                `Two-${suffix}`,

              role:
                "CASHIER",
            });

        assert.equal(
          secondEmployeeResponse.status,
          201,
        );

        const secondEmployee =
          secondEmployeeResponse.body.data;

        //************************************************************** */
        // September 1

        const septemberOne =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                firstEmployee.id,

              clockInAt:
                "2026-09-01T08:00:00.000Z",

              clockOutAt:
                "2026-09-01T16:00:00.000Z",

              breakMinutes:
                0,

              reason:
                "Range integration setup.",
            });

        assert.equal(
          septemberOne.status,
          201,
        );

        //************************************************************** */
        // September 15

        const septemberFifteen =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                secondEmployee.id,

              clockInAt:
                "2026-09-15T08:00:00.000Z",

              clockOutAt:
                "2026-09-15T16:00:00.000Z",

              breakMinutes:
                0,

              reason:
                "Range integration setup.",
            });

        assert.equal(
          septemberFifteen.status,
          201,
        );

        //************************************************************** */
        // October 1

        const octoberOne =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                firstEmployee.id,

              clockInAt:
                "2026-10-01T08:00:00.000Z",

              clockOutAt:
                "2026-10-01T16:00:00.000Z",

              breakMinutes:
                0,

              reason:
                "Range integration setup.",
            });

        assert.equal(
          octoberOne.status,
          201,
        );

        //************************************************************** */
        // Daily

        const dailyResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/time-clock/report`,
            )
            .query({
              range:
                "DAILY",

              anchorDate:
                "2026-09-15T12:00:00.000Z",

              includeInactive:
                "false",
            });

        assert.equal(
          dailyResponse.status,
          200,
        );

        assert.equal(
          dailyResponse.body.data.summary.entryCount,
          1,
        );

        assert.equal(
          dailyResponse.body.data.entries[0].employeeId,
          secondEmployee.id,
        );

        //************************************************************** */
        // Monthly

        const monthlyResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/time-clock/report`,
            )
            .query({
              range:
                "MONTHLY",

              anchorDate:
                "2026-09-15T12:00:00.000Z",

              includeInactive:
                "false",
            });

        assert.equal(
          monthlyResponse.status,
          200,
        );

        assert.equal(
          monthlyResponse.body.data.summary.entryCount,
          2,
        );

        //************************************************************** */
        // Annual

        const annualResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/time-clock/report`,
            )
            .query({
              range:
                "ANNUAL",

              anchorDate:
                "2026-06-15T12:00:00.000Z",

              includeInactive:
                "false",
            });

        assert.equal(
          annualResponse.status,
          200,
        );

        assert.equal(
          annualResponse.body.data.summary.entryCount,
          3,
        );

        //************************************************************** */
        // Employee filter

        const employeeResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/time-clock/report`,
            )
            .query({
              range:
                "ANNUAL",

              anchorDate:
                "2026-06-15T12:00:00.000Z",

              employeeId:
                firstEmployee.id,

              includeInactive:
                "false",
            });

        assert.equal(
          employeeResponse.status,
          200,
        );

        const employeeReport =
          employeeResponse.body.data;

        assert.equal(
          employeeReport.employeeId,
          firstEmployee.id,
        );

        assert.equal(
          employeeReport.summary.entryCount,
          2,
        );

        assert.ok(
          employeeReport.entries.every(
            (
              entry: {
                employeeId: string;
              },
            ) =>
              entry.employeeId ===
              firstEmployee.id,
          ),
        );

        assert.equal(
          employeeReport.employeeSummary.length,
          1,
        );

        assert.equal(
          employeeReport.employeeSummary[0].employeeId,
          firstEmployee.id,
        );
      },
    );

    //************************************************************** */

    it(
      "supports custom ranges and includeInactive",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          Date.now().toString();

        //************************************************************** */
        // Active employee

        const activeEmployeeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                "Active",

              lastName:
                `Report-${suffix}`,

              role:
                "TECHNICIAN",
            });

        assert.equal(
          activeEmployeeResponse.status,
          201,
        );

        const activeEmployee =
          activeEmployeeResponse.body.data;

        //************************************************************** */
        // Employee that will become inactive

        const inactiveEmployeeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                "Inactive",

              lastName:
                `Report-${suffix}`,

              role:
                "PARTS_SPECIALIST",
            });

        assert.equal(
          inactiveEmployeeResponse.status,
          201,
        );

        const inactiveEmployee =
          inactiveEmployeeResponse.body.data;

        //************************************************************** */

        for (
          const employee of [
            activeEmployee,
            inactiveEmployee,
          ]
        ) {
          const entryResponse =
            await agent
              .post(
                `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
              )
              .send({
                employeeId:
                  employee.id,

                clockInAt:
                  "2026-09-08T08:00:00.000Z",

                clockOutAt:
                  "2026-09-08T16:00:00.000Z",

                breakMinutes:
                  0,

                reason:
                  "Custom report integration setup.",
              });

          assert.equal(
            entryResponse.status,
            201,
          );
        }

        //************************************************************** */
        // Deactivate second employee after the historical time exists.

        const deactivateResponse =
          await agent.post(
            `/api/v1/organizations/${organizationId}/employees/${inactiveEmployee.id}/deactivate`,
          );

        assert.equal(
          deactivateResponse.status,
          200,
        );

        //************************************************************** */
        // Default excludes inactive employees.

        const activeOnlyResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/time-clock/report`,
            )
            .query({
              range:
                "CUSTOM",

              startDate:
                "2026-09-08T00:00:00.000Z",

              endDate:
                "2026-09-08T23:59:59.999Z",

              includeInactive:
                "false",
            });

        assert.equal(
          activeOnlyResponse.status,
          200,
        );

        assert.equal(
          activeOnlyResponse.body.data.summary.entryCount,
          1,
        );

        assert.equal(
          activeOnlyResponse.body.data.entries[0].employeeId,
          activeEmployee.id,
        );

        //************************************************************** */
        // Include inactive brings historical employee back.

        const allResponse =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/time-clock/report`,
            )
            .query({
              range:
                "CUSTOM",

              startDate:
                "2026-09-08T00:00:00.000Z",

              endDate:
                "2026-09-08T23:59:59.999Z",

              includeInactive:
                "true",
            });

        assert.equal(
          allResponse.status,
          200,
        );

        assert.equal(
          allResponse.body.data.includeInactive,
          true,
        );

        assert.equal(
          allResponse.body.data.summary.entryCount,
          2,
        );

        assert.ok(
          allResponse.body.data.entries.some(
            (
              entry: {
                employeeId: string;
              },
            ) =>
              entry.employeeId ===
              inactiveEmployee.id,
          ),
        );
      },
    );

    //************************************************************** */

    it(
      "requires both dates for a custom report",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const response =
          await agent
            .get(
              `/api/v1/organizations/${organizationId}/time-clock/report`,
            )
            .query({
              range:
                "CUSTOM",

              startDate:
                "2026-09-01",

              includeInactive:
                "false",
            });

        assert.equal(
          response.status,
          400,
        );

        assert.equal(
          response.body.success,
          false,
        );
      },
    );
  },
);

//************************************************************** */