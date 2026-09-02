import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Time Clock kiosk integration", () => {
  it("clocks an active employee in and out using the employee PIN", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Employee

    const employeeResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/employees`)
      .send({
        firstName: "Clock",

        lastName: `Employee-${suffix}`,

        role: "TECHNICIAN",

        pin: "4826",

        hourlyRate: 25,

        laborRate: 125,
      });

    assert.equal(employeeResponse.status, 201);

    const employee = employeeResponse.body.data;

    assert.equal(employee.hasPin, true);

    //************************************************************** */
    // Initial status

    const initialStatusResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/time-clock/employees/${employee.id}/status`,
    );

    assert.equal(initialStatusResponse.status, 200);

    assert.equal(initialStatusResponse.body.data.clockedIn, false);

    assert.equal(initialStatusResponse.body.data.activeEntry, null);

    //************************************************************** */
    // Clock in

    const clockInResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/time-clock/employees/${employee.id}/clock-in`,
      )
      .send({
        pin: "4826",
      });

    assert.equal(clockInResponse.status, 201);

    assert.equal(clockInResponse.body.success, true);

    const clockInEntry = clockInResponse.body.data;

    assert.equal(clockInEntry.employeeId, employee.id);

    assert.equal(clockInEntry.status, "CLOCKED_IN");

    assert.equal(clockInEntry.source, "TIME_CLOCK_KIOSK");

    assert.equal(clockInEntry.authMethod, "PIN");

    assert.equal(clockInEntry.clockOutAt, null);

    //************************************************************** */
    // Current list

    const currentResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/time-clock/current`,
    );

    assert.equal(currentResponse.status, 200);

    const currentEntry = currentResponse.body.data.find(
      (entry: { employeeId: string }) => entry.employeeId === employee.id,
    );

    assert.ok(currentEntry);

    assert.equal(currentEntry.status, "CLOCKED_IN");

    //************************************************************** */
    // Status now clocked in

    const clockedInStatusResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/time-clock/employees/${employee.id}/status`,
    );

    assert.equal(clockedInStatusResponse.status, 200);

    assert.equal(clockedInStatusResponse.body.data.clockedIn, true);

    assert.equal(
      clockedInStatusResponse.body.data.activeEntry.id,
      clockInEntry.id,
    );

    //************************************************************** */
    // Duplicate clock-in blocked

    const duplicateResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/time-clock/employees/${employee.id}/clock-in`,
      )
      .send({
        pin: "4826",
      });

    assert.equal(duplicateResponse.status, 409);

    assert.equal(duplicateResponse.body.success, false);

    //************************************************************** */
    // Clock out

    const clockOutResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/time-clock/employees/${employee.id}/clock-out`,
      )
      .send({
        pin: "4826",
      });

    assert.equal(clockOutResponse.status, 200);

    const clockOutEntry = clockOutResponse.body.data;

    assert.equal(clockOutEntry.id, clockInEntry.id);

    assert.equal(clockOutEntry.status, "CLOCKED_OUT");

    assert.ok(clockOutEntry.clockOutAt);

    assert.ok(Number(clockOutEntry.workedMinutes) >= 0);

    //************************************************************** */
    // No longer active

    const finalStatusResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/time-clock/employees/${employee.id}/status`,
    );

    assert.equal(finalStatusResponse.status, 200);

    assert.equal(finalStatusResponse.body.data.clockedIn, false);

    assert.equal(finalStatusResponse.body.data.activeEntry, null);

    //************************************************************** */
    // History

    const historyResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/time-clock/employees/${employee.id}/history`,
    );

    assert.equal(historyResponse.status, 200);

    assert.ok(
      historyResponse.body.data.some(
        (entry: { id: string }) => entry.id === clockInEntry.id,
      ),
    );

    const storedEntry = await prisma.employeeTimeEntry.findUniqueOrThrow({
      where: {
        id: clockInEntry.id,
      },
    });

    assert.equal(storedEntry.status, "CLOCKED_OUT");

    assert.ok(storedEntry.clockOutAt);
  });

  //************************************************************** */

  it("rejects an invalid PIN without creating a time entry", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    const employeeResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/employees`)
      .send({
        firstName: "Wrong",

        lastName: `Pin-${suffix}`,

        role: "CASHIER",

        pin: "1357",
      });

    assert.equal(employeeResponse.status, 201);

    const employee = employeeResponse.body.data;

    const response = await agent
      .post(
        `/api/v1/organizations/${organizationId}/time-clock/employees/${employee.id}/clock-in`,
      )
      .send({
        pin: "9999",
      });

    assert.equal(response.status, 401);

    assert.equal(response.body.success, false);

    const count = await prisma.employeeTimeEntry.count({
      where: {
        organizationId,

        employeeId: employee.id,
      },
    });

    assert.equal(count, 0);
  });

  //************************************************************** */

  it("rejects clock-in for an employee without a configured PIN", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    const employeeResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/employees`)
      .send({
        firstName: "No",

        lastName: `Pin-${suffix}`,

        role: "PARTS_SPECIALIST",
      });

    assert.equal(employeeResponse.status, 201);

    const employee = employeeResponse.body.data;

    assert.equal(employee.hasPin, false);

    const response = await agent
      .post(
        `/api/v1/organizations/${organizationId}/time-clock/employees/${employee.id}/clock-in`,
      )
      .send({
        pin: "1234",
      });

    assert.equal(response.status, 400);

    assert.equal(response.body.success, false);
  });

  //************************************************************** */

  it("rejects clock-out when the employee has no active time entry", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    const employeeResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/employees`)
      .send({
        firstName: "Not",

        lastName: `Clocked-${suffix}`,

        role: "SERVICE_ADVISOR",

        pin: "2468",
      });

    assert.equal(employeeResponse.status, 201);

    const employee = employeeResponse.body.data;

    const response = await agent
      .post(
        `/api/v1/organizations/${organizationId}/time-clock/employees/${employee.id}/clock-out`,
      )
      .send({
        pin: "2468",
      });

    assert.equal(response.status, 409);

    assert.equal(response.body.success, false);
  });
});

//************************************************************** */
