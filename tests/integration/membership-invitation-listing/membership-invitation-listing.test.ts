import assert from "node:assert/strict";

import { describe, it } from "node:test";

import {
  MembershipRole,
  MembershipStatus,
} from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Membership invitation listing integration", () => {
  it("lists organization membership invitations with pagination", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const emails = [
      `invite-list-1-${Date.now()}@motodesk.local`,
      `invite-list-2-${Date.now()}@motodesk.local`,
      `invite-list-3-${Date.now()}@motodesk.local`,
    ];

    for (const email of emails) {
      const response = await agent
        .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
        .send({
          email,

          role: MembershipRole.TECHNICIAN,
        });

      assert.equal(response.status, 201);
    }

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/membership-invitations?page=1&pageSize=2`,
    );

    assert.equal(response.status, 200);

    assert.equal(response.body.success, true);

    assert.equal(response.body.data.items.length, 2);

    assert.equal(response.body.data.pagination.page, 1);

    assert.equal(response.body.data.pagination.pageSize, 2);

    assert.equal(response.body.data.pagination.totalItems >= 3, true);
  });

  //************************************************************** */

  it("returns invitation records scoped to the requested organization", async () => {
    const first = await createAuthenticatedAgent();

    const ownerMembership = await prisma.membership.findUniqueOrThrow({
      where: {
        id: first.membershipId,
      },
    });

    const secondOrganization = await prisma.organization.create({
      data: {
        name: `Invitation Scope ${Date.now()}`,

        slug: `invitation-scope-${Date.now()}-${Math.random()}`,
      },
    });

    const secondMembership = await prisma.membership.create({
      data: {
        organizationId: secondOrganization.id,

        userId: ownerMembership.userId,

        role: MembershipRole.OWNER,

        status: MembershipStatus.ACTIVE,
      },
    });

    const firstEmail = `invite-scope-first-${Date.now()}@motodesk.local`;

    const secondEmail = `invite-scope-second-${Date.now()}@motodesk.local`;

    const firstCreateResponse = await first.agent
      .post(
        `/api/v1/organizations/${first.organizationId}/membership-invitations`,
      )
      .send({
        email: firstEmail,

        role: MembershipRole.PARTS,
      });

    assert.equal(firstCreateResponse.status, 201);

    await prisma.membershipInvitation.create({
      data: {
        organizationId: secondOrganization.id,

        invitedByMembershipId: secondMembership.id,

        email: secondEmail,

        role: MembershipRole.SERVICE_ADVISOR,

        tokenHash: `scope-test-${Date.now()}-${Math.random()}`,

        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      },
    });

    const response = await first.agent.get(
      `/api/v1/organizations/${first.organizationId}/membership-invitations?page=1&pageSize=100`,
    );

    assert.equal(response.status, 200);

    const emails = response.body.data.items.map(
      (invitation: { email: string }) => invitation.email,
    );

    assert.equal(emails.includes(firstEmail), true);

    assert.equal(emails.includes(secondEmail), false);
  });

  //************************************************************** */

  it("orders invitations by newest first", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const firstEmail = `invite-order-first-${Date.now()}@motodesk.local`;

    const secondEmail = `invite-order-second-${Date.now()}@motodesk.local`;

    const firstResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: firstEmail,

        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(firstResponse.status, 201);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const secondResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: secondEmail,

        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(secondResponse.status, 201);

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/membership-invitations?page=1&pageSize=100`,
    );

    assert.equal(response.status, 200);

    const items = response.body.data.items;

    const firstIndex = items.findIndex(
      (invitation: { email: string }) => invitation.email === firstEmail,
    );

    const secondIndex = items.findIndex(
      (invitation: { email: string }) => invitation.email === secondEmail,
    );

    assert.equal(firstIndex >= 0, true);

    assert.equal(secondIndex >= 0, true);

    assert.equal(secondIndex < firstIndex, true);
  });
});

//************************************************************** */
