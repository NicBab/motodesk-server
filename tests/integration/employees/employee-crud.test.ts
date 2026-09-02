import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Employee CRUD integration", () => {
  it("creates, lists, updates, deactivates, and restores an employee without exposing the PIN hash", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    //************************************************************** */
    // Create

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/employees`)
      .send({
        firstName: "Alex",

        lastName: `Employee-${suffix}`,

        role: "TECHNICIAN",

        phone: "337-555-0101",

        email: `employee-${suffix}@motodesk.test`,

        hourlyRate: 28.5,

        laborRate: 125,

        hireDate: "2026-09-01",

        pin: "4826",

        isSchedulable: true,

        dailyStartTime: "08:00",

        dailyEndTime: "17:00",

        maxDailyHours: 8,

        skills: "Diagnostics, electrical, engine repair",
      });

    assert.equal(createResponse.status, 201);

    assert.equal(createResponse.body.success, true);

    const employee = createResponse.body.data;

    assert.ok(employee.id);

    assert.equal(employee.organizationId, organizationId);

    assert.equal(employee.firstName, "Alex");

    assert.equal(employee.lastName, `Employee-${suffix}`);

    assert.equal(employee.role, "TECHNICIAN");

    assert.equal(employee.status, "ACTIVE");

    assert.equal(employee.isSchedulable, true);

    assert.equal(employee.hasPin, true);

    assert.equal("pinHash" in employee, false);

    assert.equal("pin" in employee, false);

    const employeeId = employee.id;

    //************************************************************** */
    // Confirm PIN is actually hashed in the database.

    const storedEmployee = await prisma.employee.findUniqueOrThrow({
      where: {
        id: employeeId,
      },
    });

    assert.ok(storedEmployee.pinHash);

    assert.notEqual(storedEmployee.pinHash, "4826");

    //************************************************************** */
    // Get by ID

    const getResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/employees/${employeeId}`,
    );

    assert.equal(getResponse.status, 200);

    assert.equal(getResponse.body.success, true);

    assert.equal(getResponse.body.data.id, employeeId);

    assert.equal(getResponse.body.data.hasPin, true);

    assert.equal("pinHash" in getResponse.body.data, false);

    //************************************************************** */
    // Search

    const searchResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/employees?search=${suffix}`,
    );

    assert.equal(searchResponse.status, 200);

    assert.equal(searchResponse.body.success, true);

    assert.ok(Array.isArray(searchResponse.body.data));

    const searchMatch = searchResponse.body.data.find(
      (item: { id: string }) => item.id === employeeId,
    );

    assert.ok(searchMatch);

    //************************************************************** */
    // Role filter

    const roleResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/employees?role=TECHNICIAN`,
    );

    assert.equal(roleResponse.status, 200);

    assert.ok(
      roleResponse.body.data.some(
        (item: { id: string }) => item.id === employeeId,
      ),
    );

    //************************************************************** */
    // Active filter

    const activeResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/employees?status=ACTIVE`,
    );

    assert.equal(activeResponse.status, 200);

    assert.ok(
      activeResponse.body.data.some(
        (item: { id: string }) => item.id === employeeId,
      ),
    );

    //************************************************************** */
    // Update

    const updateResponse = await agent
      .patch(`/api/v1/organizations/${organizationId}/employees/${employeeId}`)
      .send({
        firstName: "Alexander",

        role: "SHOP_MANAGER",

        hourlyRate: 32,

        laborRate: 135,

        dailyStartTime: "07:30",

        dailyEndTime: "16:30",

        maxDailyHours: 9,

        skills: "Diagnostics, electrical, engine repair, management",

        pin: "7391",
      });

    assert.equal(updateResponse.status, 200);

    assert.equal(updateResponse.body.success, true);

    assert.equal(updateResponse.body.data.firstName, "Alexander");

    assert.equal(updateResponse.body.data.role, "SHOP_MANAGER");

    assert.equal(Number(updateResponse.body.data.hourlyRate), 32);

    assert.equal(Number(updateResponse.body.data.laborRate), 135);

    assert.equal(updateResponse.body.data.dailyStartTime, "07:30");

    assert.equal(updateResponse.body.data.dailyEndTime, "16:30");

    assert.equal(updateResponse.body.data.hasPin, true);

    assert.equal("pinHash" in updateResponse.body.data, false);

    //************************************************************** */
    // Confirm PIN changed and is still hashed.

    const updatedStoredEmployee = await prisma.employee.findUniqueOrThrow({
      where: {
        id: employeeId,
      },
    });

    assert.ok(updatedStoredEmployee.pinHash);

    assert.notEqual(updatedStoredEmployee.pinHash, storedEmployee.pinHash);

    assert.notEqual(updatedStoredEmployee.pinHash, "7391");

    //************************************************************** */
    // Deactivate

    const deactivateResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/employees/${employeeId}/deactivate`,
    );

    assert.equal(deactivateResponse.status, 200);

    assert.equal(deactivateResponse.body.success, true);

    assert.equal(deactivateResponse.body.data.status, "INACTIVE");

    assert.equal(deactivateResponse.body.data.isSchedulable, false);

    //************************************************************** */
    // Inactive filter

    const inactiveResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/employees?status=INACTIVE`,
    );

    assert.equal(inactiveResponse.status, 200);

    assert.ok(
      inactiveResponse.body.data.some(
        (item: { id: string }) => item.id === employeeId,
      ),
    );

    //************************************************************** */
    // Restore

    const restoreResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/employees/${employeeId}/restore`,
    );

    assert.equal(restoreResponse.status, 200);

    assert.equal(restoreResponse.body.success, true);

    assert.equal(restoreResponse.body.data.status, "ACTIVE");

    /*
     * Restore intentionally does not automatically turn scheduling
     * back on. The employee may have been intentionally marked as
     * not schedulable before being deactivated.
     */
    assert.equal(restoreResponse.body.data.isSchedulable, false);

    //************************************************************** */
    // Clear PIN

    const clearPinResponse = await agent
      .patch(`/api/v1/organizations/${organizationId}/employees/${employeeId}`)
      .send({
        pin: null,
      });

    assert.equal(clearPinResponse.status, 200);

    assert.equal(clearPinResponse.body.data.hasPin, false);

    assert.equal("pinHash" in clearPinResponse.body.data, false);

    const clearedStoredEmployee = await prisma.employee.findUniqueOrThrow({
      where: {
        id: employeeId,
      },
    });

    assert.equal(clearedStoredEmployee.pinHash, null);
  });

  //************************************************************** */

  it("rejects invalid employee PINs", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const suffix = Date.now().toString();

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/employees`)
      .send({
        firstName: "Invalid",

        lastName: `Pin-${suffix}`,

        role: "CASHIER",

        pin: "12AB",
      });

    assert.equal(response.status, 400);

    assert.equal(response.body.success, false);

    const count = await prisma.employee.count({
      where: {
        organizationId,

        lastName: `Pin-${suffix}`,
      },
    });

    assert.equal(count, 0);
  });
});

//************************************************************** */
