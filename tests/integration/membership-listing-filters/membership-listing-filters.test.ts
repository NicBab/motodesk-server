import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
  MembershipRole,
  MembershipStatus,
} from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

function createSafeSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

//************************************************************** */

async function createMembershipFixture(
  organizationId: string,
  role: MembershipRole,
  status: MembershipStatus,
  firstName: string,
  lastName: string,
  emailPrefix: string,
) {
  const suffix = createSafeSuffix();

  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}-${suffix}@motodesk.local`,

      passwordHash: "integration-test-not-used",

      firstName,
      lastName,

      isActive: true,
    },
  });

  return prisma.membership.create({
    data: {
      organizationId,

      userId: user.id,

      role,

      status,
    },

    include: {
      user: true,
    },
  });
}

//************************************************************** */

describe("Membership listing filters integration", () => {
  it("filters memberships by status", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const activeMembership = await createMembershipFixture(
      organizationId,
      MembershipRole.TECHNICIAN,
      MembershipStatus.ACTIVE,
      "Active",
      "Technician",
      "active-filter",
    );

    const suspendedMembership = await createMembershipFixture(
      organizationId,
      MembershipRole.TECHNICIAN,
      MembershipStatus.SUSPENDED,
      "Suspended",
      "Technician",
      "suspended-filter",
    );

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/memberships?status=SUSPENDED&page=1&pageSize=100`,
    );

    assert.equal(response.status, 200);

    const membershipIds = response.body.data.items.map(
      (membership: { id: string }) => membership.id,
    );

    assert.equal(membershipIds.includes(suspendedMembership.id), true);

    assert.equal(membershipIds.includes(activeMembership.id), false);

    assert.equal(
      response.body.data.items.every(
        (membership: { status: string }) =>
          membership.status === MembershipStatus.SUSPENDED,
      ),
      true,
    );
  });

  //************************************************************** */

  it("filters memberships by role", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const partsMembership = await createMembershipFixture(
      organizationId,
      MembershipRole.PARTS,
      MembershipStatus.ACTIVE,
      "Parts",
      "Employee",
      "parts-role-filter",
    );

    const technicianMembership = await createMembershipFixture(
      organizationId,
      MembershipRole.TECHNICIAN,
      MembershipStatus.ACTIVE,
      "Technician",
      "Employee",
      "technician-role-filter",
    );

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/memberships?role=PARTS&page=1&pageSize=100`,
    );

    assert.equal(response.status, 200);

    const membershipIds = response.body.data.items.map(
      (membership: { id: string }) => membership.id,
    );

    assert.equal(membershipIds.includes(partsMembership.id), true);

    assert.equal(membershipIds.includes(technicianMembership.id), false);

    assert.equal(
      response.body.data.items.every(
        (membership: { role: string }) =>
          membership.role === MembershipRole.PARTS,
      ),
      true,
    );
  });

  //************************************************************** */

  it("searches memberships by first name, last name, and email", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const firstNameMembership = await createMembershipFixture(
      organizationId,
      MembershipRole.MANAGER,
      MembershipStatus.ACTIVE,
      "UniqueFirst",
      "Alpha",
      "search-first",
    );

    const lastNameMembership = await createMembershipFixture(
      organizationId,
      MembershipRole.MANAGER,
      MembershipStatus.ACTIVE,
      "Beta",
      "UniqueLast",
      "search-last",
    );

    const emailMembership = await createMembershipFixture(
      organizationId,
      MembershipRole.MANAGER,
      MembershipStatus.ACTIVE,
      "Gamma",
      "Employee",
      "unique-email-search",
    );

    const firstNameResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/memberships?search=uniquefirst&page=1&pageSize=100`,
    );

    assert.equal(firstNameResponse.status, 200);

    assert.equal(
      firstNameResponse.body.data.items.some(
        (membership: { id: string }) =>
          membership.id === firstNameMembership.id,
      ),
      true,
    );

    const lastNameResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/memberships?search=uniquelast&page=1&pageSize=100`,
    );

    assert.equal(lastNameResponse.status, 200);

    assert.equal(
      lastNameResponse.body.data.items.some(
        (membership: { id: string }) => membership.id === lastNameMembership.id,
      ),
      true,
    );

    const emailResponse = await agent.get(
      `/api/v1/organizations/${organizationId}/memberships?search=unique-email-search&page=1&pageSize=100`,
    );

    assert.equal(emailResponse.status, 200);

    assert.equal(
      emailResponse.body.data.items.some(
        (membership: { id: string }) => membership.id === emailMembership.id,
      ),
      true,
    );
  });

  //************************************************************** */

  it("combines status, role, and search filters while preserving pagination totals", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const matchingOne = await createMembershipFixture(
      organizationId,
      MembershipRole.TECHNICIAN,
      MembershipStatus.ACTIVE,
      "Combined",
      "MatchOne",
      "combined-one",
    );

    const matchingTwo = await createMembershipFixture(
      organizationId,
      MembershipRole.TECHNICIAN,
      MembershipStatus.ACTIVE,
      "Combined",
      "MatchTwo",
      "combined-two",
    );

    await createMembershipFixture(
      organizationId,
      MembershipRole.PARTS,
      MembershipStatus.ACTIVE,
      "Combined",
      "WrongRole",
      "combined-wrong-role",
    );

    await createMembershipFixture(
      organizationId,
      MembershipRole.TECHNICIAN,
      MembershipStatus.SUSPENDED,
      "Combined",
      "WrongStatus",
      "combined-wrong-status",
    );

    await createMembershipFixture(
      organizationId,
      MembershipRole.TECHNICIAN,
      MembershipStatus.ACTIVE,
      "Different",
      "SearchValue",
      "different-search",
    );

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/memberships?status=ACTIVE&role=TECHNICIAN&search=combined&page=1&pageSize=1`,
    );

    assert.equal(response.status, 200);

    assert.equal(response.body.data.items.length, 1);

    assert.equal(response.body.data.pagination.page, 1);

    assert.equal(response.body.data.pagination.pageSize, 1);

    assert.equal(response.body.data.pagination.totalItems, 2);

    const matchingIds = [matchingOne.id, matchingTwo.id];

    assert.equal(matchingIds.includes(response.body.data.items[0].id), true);
  });
});

//************************************************************** */
