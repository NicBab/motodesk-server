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

describe("Employee tenant isolation integration", () => {
  it("prevents cross-organization employee access and foreign membership linking", async () => {
    const {
      agent,
      organizationId: organizationAId,
      membershipId: membershipAId,
    } = await createAuthenticatedAgent();

    const suffix = createSafeSuffix();

    //************************************************************** */
    // Organization B

    const organizationBResponse = await agent
      .post("/api/v1/organizations")
      .send({
        name: `Employee Tenant B ${suffix}`,
        slug: `employee-tenant-b-${suffix}`,
      });

    assert.equal(organizationBResponse.status, 201);

    const organizationBId =
      organizationBResponse.body.data.id;

    //************************************************************** */
    // Locate the current user's membership in Organization B.
    //
    // Organization creation establishes the owner's membership.

    const membershipB =
      await prisma.membership.findFirstOrThrow({
        where: {
          organizationId: organizationBId,
        },
      });

    const membershipBId =
      membershipB.id;

    //************************************************************** */
    // Create protected Employee B.

    await switchOrganization(
      agent,
      organizationBId,
    );

    const employeeBResponse = await agent
      .post(
        `/api/v1/organizations/${organizationBId}/employees`,
      )
      .send({
        firstName: "Foreign",

        lastName: `Employee-${suffix}`,

        role: "TECHNICIAN",

        hourlyRate: 30,

        laborRate: 125,

        pin: "4826",

        membershipId: membershipBId,

        isSchedulable: true,

        dailyStartTime: "08:00",

        dailyEndTime: "17:00",

        maxDailyHours: 8,

        skills: "Protected Organization B technician",
      });

    assert.equal(employeeBResponse.status, 201);

    const employeeBId =
      employeeBResponse.body.data.id;

    assert.equal(
      employeeBResponse.body.data.organizationId,
      organizationBId,
    );

    assert.equal(
      employeeBResponse.body.data.membershipId,
      membershipBId,
    );

    //************************************************************** */
    // Switch back to Organization A.

    await switchOrganization(
      agent,
      organizationAId,
    );

    //************************************************************** */
    // Create local Employee A.
    //
    // Leave membership unlinked initially so we can test foreign
    // membership injection against an existing local employee.

    const employeeAResponse = await agent
      .post(
        `/api/v1/organizations/${organizationAId}/employees`,
      )
      .send({
        firstName: "Local",

        lastName: `Employee-${suffix}`,

        role: "TECHNICIAN",

        hourlyRate: 28,

        laborRate: 120,

        pin: "7391",

        isSchedulable: true,

        dailyStartTime: "08:00",

        dailyEndTime: "17:00",

        maxDailyHours: 8,

        skills: "Organization A technician",
      });

    assert.equal(employeeAResponse.status, 201);

    const employeeAId =
      employeeAResponse.body.data.id;

    //************************************************************** */
    // Capture protected Employee B state.

    const initialEmployeeB =
      await prisma.employee.findUniqueOrThrow({
        where: {
          id: employeeBId,
        },
      });

    const initialEmployeeBPinHash =
      initialEmployeeB.pinHash;

    assert.ok(initialEmployeeBPinHash);

    //************************************************************** */
    // FOREIGN READ

    const foreignReadResponse =
      await agent.get(
        `/api/v1/organizations/${organizationAId}/employees/${employeeBId}`,
      );

    assert.equal(
      foreignReadResponse.status,
      404,
    );

    assert.equal(
      foreignReadResponse.body.code,
      "EMPLOYEE_NOT_FOUND",
    );

    //************************************************************** */
    // FOREIGN UPDATE
    //
    // Attempt several meaningful mutations at once, including PIN.

    const foreignUpdateResponse =
      await agent
        .patch(
          `/api/v1/organizations/${organizationAId}/employees/${employeeBId}`,
        )
        .send({
          firstName:
            "COMPROMISED",

          role:
            "SHOP_MANAGER",

          hourlyRate:
            999,

          laborRate:
            999,

          pin:
            "1111",

          isSchedulable:
            false,

          skills:
            "CROSS TENANT MUTATION",
        });

    assert.equal(
      foreignUpdateResponse.status,
      404,
    );

    assert.equal(
      foreignUpdateResponse.body.code,
      "EMPLOYEE_NOT_FOUND",
    );

    //************************************************************** */
    // FOREIGN DEACTIVATE

    const foreignDeactivateResponse =
      await agent.post(
        `/api/v1/organizations/${organizationAId}/employees/${employeeBId}/deactivate`,
      );

    assert.equal(
      foreignDeactivateResponse.status,
      404,
    );

    assert.equal(
      foreignDeactivateResponse.body.code,
      "EMPLOYEE_NOT_FOUND",
    );

    //************************************************************** */
    // FOREIGN RESTORE
    //
    // Even though Employee B is currently ACTIVE, ownership should
    // fail before lifecycle-state validation.

    const foreignRestoreResponse =
      await agent.post(
        `/api/v1/organizations/${organizationAId}/employees/${employeeBId}/restore`,
      );

    assert.equal(
      foreignRestoreResponse.status,
      404,
    );

    assert.equal(
      foreignRestoreResponse.body.code,
      "EMPLOYEE_NOT_FOUND",
    );

    //************************************************************** */
    // LIST ISOLATION

    const listResponse =
      await agent.get(
        `/api/v1/organizations/${organizationAId}/employees`,
      );

    assert.equal(listResponse.status, 200);

    assert.equal(
      listResponse.body.data.some(
        (employee: { id: string }) =>
          employee.id === employeeBId,
      ),
      false,
    );

    //************************************************************** */
    // SEARCH ISOLATION
    //
    // Employee B's unique suffix must not make the foreign employee
    // visible through Organization A's employee search.

    const searchResponse =
      await agent
        .get(
          `/api/v1/organizations/${organizationAId}/employees`,
        )
        .query({
          search: suffix,
        });

    assert.equal(searchResponse.status, 200);

    assert.equal(
      searchResponse.body.data.some(
        (employee: { id: string }) =>
          employee.id === employeeBId,
      ),
      false,
    );

    //************************************************************** */
    // FOREIGN MEMBERSHIP INJECTION — CREATE
    //
    // Employee itself would belong to A, but the submitted membership
    // belongs to B.

    const foreignMembershipCreateResponse =
      await agent
        .post(
          `/api/v1/organizations/${organizationAId}/employees`,
        )
        .send({
          firstName:
            "CrossTenant",

          lastName:
            `Membership-Create-${suffix}`,

          role:
            "SERVICE_ADVISOR",

          membershipId:
            membershipBId,

          isSchedulable:
            true,
        });

    assert.equal(
      foreignMembershipCreateResponse.status,
      400,
    );

    assert.equal(
      foreignMembershipCreateResponse.body.code,
      "EMPLOYEE_MEMBERSHIP_INVALID",
    );

    //************************************************************** */
    // Ensure rejected create produced no Employee A record.

    const rejectedCreate =
      await prisma.employee.findFirst({
        where: {
          organizationId:
            organizationAId,

          lastName:
            `Membership-Create-${suffix}`,
        },
      });

    assert.equal(
      rejectedCreate,
      null,
    );

    //************************************************************** */
    // FOREIGN MEMBERSHIP INJECTION — UPDATE
    //
    // Existing Employee A cannot be linked to Organization B's
    // membership.

    const foreignMembershipUpdateResponse =
      await agent
        .patch(
          `/api/v1/organizations/${organizationAId}/employees/${employeeAId}`,
        )
        .send({
          membershipId:
            membershipBId,
        });

    assert.equal(
      foreignMembershipUpdateResponse.status,
      400,
    );

    assert.equal(
      foreignMembershipUpdateResponse.body.code,
      "EMPLOYEE_MEMBERSHIP_INVALID",
    );

    //************************************************************** */
    // DATABASE INVARIANT — Employee B remains untouched.

    const storedEmployeeB =
      await prisma.employee.findUniqueOrThrow({
        where: {
          id: employeeBId,
        },
      });

    assert.equal(
      storedEmployeeB.organizationId,
      organizationBId,
    );

    assert.equal(
      storedEmployeeB.membershipId,
      membershipBId,
    );

    assert.equal(
      storedEmployeeB.firstName,
      initialEmployeeB.firstName,
    );

    assert.equal(
      storedEmployeeB.lastName,
      initialEmployeeB.lastName,
    );

    assert.equal(
      storedEmployeeB.role,
      initialEmployeeB.role,
    );

    assert.equal(
      storedEmployeeB.status,
      initialEmployeeB.status,
    );

    assert.equal(
      Number(storedEmployeeB.hourlyRate),
      Number(initialEmployeeB.hourlyRate),
    );

    assert.equal(
      Number(storedEmployeeB.laborRate),
      Number(initialEmployeeB.laborRate),
    );

    assert.equal(
      storedEmployeeB.isSchedulable,
      initialEmployeeB.isSchedulable,
    );

    assert.equal(
      storedEmployeeB.skills,
      initialEmployeeB.skills,
    );

    assert.equal(
      storedEmployeeB.pinHash,
      initialEmployeeBPinHash,
    );

    //************************************************************** */
    // DATABASE INVARIANT — Employee A did not acquire Membership B.

    const storedEmployeeA =
      await prisma.employee.findUniqueOrThrow({
        where: {
          id: employeeAId,
        },
      });

    assert.equal(
      storedEmployeeA.organizationId,
      organizationAId,
    );

    assert.equal(
      storedEmployeeA.membershipId,
      null,
    );

    //************************************************************** */
    // Explicit cross-tenant membership invariant.
    //
    // No Organization A employee may reference Organization B's
    // membership.

    const crossTenantMembershipLink =
      await prisma.employee.findFirst({
        where: {
          organizationId:
            organizationAId,

          membershipId:
            membershipBId,
        },
      });

    assert.equal(
      crossTenantMembershipLink,
      null,
    );

    //************************************************************** */
    // Sanity check that A's own membership remains an A membership.
    //
    // This also proves the two IDs used by the attack are genuinely
    // from separate organizations.

    const membershipA =
      await prisma.membership.findFirstOrThrow({
        where: {
          id:
            membershipAId,

          organizationId:
            organizationAId,
        },
      });

    assert.equal(
      membershipA.organizationId,
      organizationAId,
    );

    assert.notEqual(
      membershipA.id,
      membershipBId,
    );
  });
});

//************************************************************** */