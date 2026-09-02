import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import {
  prisma,
} from "../../../src/config/prisma.js";

import {
  createAuthenticatedAgent,
} from "../helpers/authenticated-agent.js";

//************************************************************** */

describe(
  "Time Clock manager integration",
  () => {
    it(
      "creates a manual time entry with manager audit history",
      async () => {
        const {
          agent,
          organizationId,
          membershipId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          Date.now().toString();

        //************************************************************** */
        // Employee

        const employeeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                "Manual",

              lastName:
                `Entry-${suffix}`,

              role:
                "TECHNICIAN",

              hourlyRate:
                30,

              laborRate:
                130,
            });

        assert.equal(
          employeeResponse.status,
          201,
        );

        const employee =
          employeeResponse.body.data;

        //************************************************************** */
        // Manual shift
        //
        // 08:00 → 17:00 = 540 minutes
        // minus 30 minute break = 510 worked minutes.

        const clockInAt =
          "2026-09-01T08:00:00.000Z";

        const clockOutAt =
          "2026-09-01T17:00:00.000Z";

        const response =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                employee.id,

              clockInAt,

              clockOutAt,

              breakMinutes:
                30,

              notes:
                "Missed clock-in",

              reason:
                "Employee forgot to clock in at start of shift.",
            });

        assert.equal(
          response.status,
          201,
        );

        assert.equal(
          response.body.success,
          true,
        );

        const entry =
          response.body.data;

        assert.equal(
          entry.employeeId,
          employee.id,
        );

        assert.equal(
          entry.employeeName,
          `${employee.firstName} ${employee.lastName}`,
        );

        assert.equal(
          entry.status,
          "CLOCKED_OUT",
        );

        assert.equal(
          entry.source,
          "MANAGER_ENTRY",
        );

        assert.equal(
          entry.authMethod,
          "MANUAL",
        );

        assert.equal(
          entry.breakMinutes,
          30,
        );

        assert.equal(
          entry.workedMinutes,
          510,
        );

        assert.equal(
          entry.notes,
          "Missed clock-in",
        );

        assert.equal(
          entry.corrections.length,
          1,
        );

        const correction =
          entry.corrections[0];

        assert.equal(
          correction.field,
          "MANUAL_ENTRY",
        );

        assert.equal(
          correction.originalValue,
          null,
        );

        assert.equal(
          correction.reason,
          "Employee forgot to clock in at start of shift.",
        );

        assert.equal(
          correction.managerMembershipId,
          membershipId,
        );

        //************************************************************** */
        // Database verification

        const storedEntry =
          await prisma.employeeTimeEntry.findUniqueOrThrow({
            where: {
              id:
                entry.id,
            },

            include: {
              corrections:
                true,
            },
          });

        assert.equal(
          storedEntry.source,
          "MANAGER_ENTRY",
        );

        assert.equal(
          storedEntry.authMethod,
          "MANUAL",
        );

        assert.equal(
          storedEntry.workedMinutes,
          510,
        );

        assert.equal(
          storedEntry.corrections.length,
          1,
        );
      },
    );

    //************************************************************** */

    it(
      "corrects an existing time entry and records every changed field",
      async () => {
        const {
          agent,
          organizationId,
          membershipId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          Date.now().toString();

        //************************************************************** */
        // Employee

        const employeeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                "Correction",

              lastName:
                `Employee-${suffix}`,

              role:
                "SERVICE_ADVISOR",
            });

        assert.equal(
          employeeResponse.status,
          201,
        );

        const employee =
          employeeResponse.body.data;

        //************************************************************** */
        // Initial manual entry
        //
        // 08:00 → 17:00
        // 30 minute break
        // 510 worked minutes

        const manualResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                employee.id,

              clockInAt:
                "2026-09-01T08:00:00.000Z",

              clockOutAt:
                "2026-09-01T17:00:00.000Z",

              breakMinutes:
                30,

              reason:
                "Initial missed punch entry.",
            });

        assert.equal(
          manualResponse.status,
          201,
        );

        const originalEntry =
          manualResponse.body.data;

        assert.equal(
          originalEntry.workedMinutes,
          510,
        );

        //************************************************************** */
        // Correct:
        //
        // clock-in 07:30
        // clock-out 16:30
        // break 45
        //
        // 9 hours = 540 minutes
        // minus 45 = 495 worked minutes

        const correctionResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/time-clock/entries/${originalEntry.id}/correction`,
            )
            .send({
              clockInAt:
                "2026-09-01T07:30:00.000Z",

              clockOutAt:
                "2026-09-01T16:30:00.000Z",

              breakMinutes:
                45,

              notes:
                "Corrected from manager review.",

              reason:
                "Employee confirmed the actual shift times.",
            });

        assert.equal(
          correctionResponse.status,
          200,
        );

        assert.equal(
          correctionResponse.body.success,
          true,
        );

        const corrected =
          correctionResponse.body.data;

        assert.equal(
          corrected.status,
          "CLOCKED_OUT",
        );

        assert.equal(
          corrected.breakMinutes,
          45,
        );

        assert.equal(
          corrected.workedMinutes,
          495,
        );

        assert.equal(
          corrected.notes,
          "Corrected from manager review.",
        );

        // One MANUAL_ENTRY audit from creation,
        // plus four field corrections.
        assert.equal(
          corrected.corrections.length,
          5,
        );

        const changedFields =
          corrected.corrections.map(
            (
              correction: {
                field: string;
              },
            ) =>
              correction.field,
          );

        assert.ok(
          changedFields.includes(
            "clockInAt",
          ),
        );

        assert.ok(
          changedFields.includes(
            "clockOutAt",
          ),
        );

        assert.ok(
          changedFields.includes(
            "breakMinutes",
          ),
        );

        assert.ok(
          changedFields.includes(
            "notes",
          ),
        );

        //************************************************************** */
        // Verify manager audit attribution.

        const fieldCorrections =
          corrected.corrections.filter(
            (
              correction: {
                field: string;
              },
            ) =>
              correction.field !==
              "MANUAL_ENTRY",
          );

        assert.equal(
          fieldCorrections.length,
          4,
        );

        for (
          const correction of
          fieldCorrections
        ) {
          assert.equal(
            correction.reason,
            "Employee confirmed the actual shift times.",
          );

          assert.equal(
            correction.managerMembershipId,
            membershipId,
          );
        }

        //************************************************************** */
        // History endpoint must return corrected record + audit trail.

        const historyResponse =
          await agent.get(
            `/api/v1/organizations/${organizationId}/time-clock/employees/${employee.id}/history`,
          );

        assert.equal(
          historyResponse.status,
          200,
        );

        const historyEntry =
          historyResponse.body.data.find(
            (
              entry: {
                id: string;
              },
            ) =>
              entry.id ===
              originalEntry.id,
          );

        assert.ok(
          historyEntry,
        );

        assert.equal(
          historyEntry.workedMinutes,
          495,
        );

        assert.equal(
          historyEntry.corrections.length,
          5,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects a manual entry where clock-out is before clock-in",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          Date.now().toString();

        const employeeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                "Invalid",

              lastName:
                `Range-${suffix}`,

              role:
                "CASHIER",
            });

        assert.equal(
          employeeResponse.status,
          201,
        );

        const employee =
          employeeResponse.body.data;

        const response =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                employee.id,

              clockInAt:
                "2026-09-01T17:00:00.000Z",

              clockOutAt:
                "2026-09-01T08:00:00.000Z",

              breakMinutes:
                0,

              reason:
                "Invalid test range.",
            });

        assert.equal(
          response.status,
          400,
        );

        assert.equal(
          response.body.success,
          false,
        );

        const count =
          await prisma.employeeTimeEntry.count({
            where: {
              organizationId,

              employeeId:
                employee.id,
            },
          });

        assert.equal(
          count,
          0,
        );
      },
    );

    //************************************************************** */

    it(
      "requires a reason for manual entries and corrections",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          Date.now().toString();

        const employeeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                "Audit",

              lastName:
                `Required-${suffix}`,

              role:
                "PARTS_SPECIALIST",
            });

        assert.equal(
          employeeResponse.status,
          201,
        );

        const employee =
          employeeResponse.body.data;

        //************************************************************** */
        // Missing manual reason

        const manualResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                employee.id,

              clockInAt:
                "2026-09-01T08:00:00.000Z",

              clockOutAt:
                "2026-09-01T17:00:00.000Z",

              breakMinutes:
                30,
            });

        assert.equal(
          manualResponse.status,
          400,
        );

        //************************************************************** */
        // Create valid entry for correction test.

        const validEntryResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/time-clock/entries/manual`,
            )
            .send({
              employeeId:
                employee.id,

              clockInAt:
                "2026-09-01T08:00:00.000Z",

              clockOutAt:
                "2026-09-01T17:00:00.000Z",

              breakMinutes:
                30,

              reason:
                "Valid manager entry.",
            });

        assert.equal(
          validEntryResponse.status,
          201,
        );

        const timeEntryId =
          validEntryResponse.body.data.id;

        //************************************************************** */
        // Missing correction reason

        const correctionResponse =
          await agent
            .patch(
              `/api/v1/organizations/${organizationId}/time-clock/entries/${timeEntryId}/correction`,
            )
            .send({
              breakMinutes:
                45,
            });

        assert.equal(
          correctionResponse.status,
          400,
        );

        const storedEntry =
          await prisma.employeeTimeEntry.findUniqueOrThrow({
            where: {
              id:
                timeEntryId,
            },
          });

        assert.equal(
          storedEntry.breakMinutes,
          30,
        );
      },
    );
  },
);

//************************************************************** */