import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  describe,
  it,
} from "node:test";

import {
  MembershipRole,
} from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

describe("Membership invitation listing integration", () => {
  it("lists organization membership invitations with pagination", async () => {
    const { agent, organizationId } =
      await createAuthenticatedAgent();

    const emails = [
      `invite-list-1-${randomUUID()}@example.com`,
      `invite-list-2-${randomUUID()}@example.com`,
      `invite-list-3-${randomUUID()}@example.com`,
    ];

    for (const email of emails) {
      const response = await agent
        .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
        .send({
          email,
          role: MembershipRole.TECHNICIAN,
        });

      assert.equal(
        response.status,
        201,
        JSON.stringify(response.body),
      );
    }

    const firstPage = await agent.get(
      `/api/v1/organizations/${organizationId}/membership-invitations?page=1&pageSize=2`,
    );

    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.success, true);
    assert.equal(firstPage.body.data.items.length, 2);
    assert.equal(firstPage.body.data.pagination.page, 1);
    assert.equal(firstPage.body.data.pagination.pageSize, 2);
    assert.equal(firstPage.body.data.pagination.totalItems, 3);

    const secondPage = await agent.get(
      `/api/v1/organizations/${organizationId}/membership-invitations?page=2&pageSize=2`,
    );

    assert.equal(secondPage.status, 200);
    assert.equal(secondPage.body.data.items.length, 1);
    assert.equal(secondPage.body.data.pagination.page, 2);
    assert.equal(secondPage.body.data.pagination.totalItems, 3);

    const returnedEmails = [
      ...firstPage.body.data.items,
      ...secondPage.body.data.items,
    ].map((invitation: { email: string }) => invitation.email);

    assert.equal(new Set(returnedEmails).size, 3);

    assert.deepEqual(
      [...returnedEmails].sort(),
      [...emails].sort(),
    );
  });

  it("returns invitation records scoped to the requested organization", async () => {
    const first = await createAuthenticatedAgent();
    const second = await createAuthenticatedAgent();

    const firstEmail =
      `invite-scope-first-${randomUUID()}@example.com`;

    const secondEmail =
      `invite-scope-second-${randomUUID()}@example.com`;

    const firstCreateResponse = await first.agent
      .post(`/api/v1/organizations/${first.organizationId}/membership-invitations`)
      .send({
        email: firstEmail,
        role: MembershipRole.PARTS,
      });

    assert.equal(
      firstCreateResponse.status,
      201,
      JSON.stringify(firstCreateResponse.body),
    );

    const secondCreateResponse = await second.agent
      .post(`/api/v1/organizations/${second.organizationId}/membership-invitations`)
      .send({
        email: secondEmail,
        role: MembershipRole.SERVICE_ADVISOR,
      });

    assert.equal(
      secondCreateResponse.status,
      201,
      JSON.stringify(secondCreateResponse.body),
    );

    const response = await first.agent.get(
      `/api/v1/organizations/${first.organizationId}/membership-invitations?page=1&pageSize=100`,
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.data.pagination.totalItems, 1);

    const items = response.body.data.items;

    assert.equal(items.length, 1);
    assert.equal(items[0].email, firstEmail);
    assert.equal(
      items[0].organizationId,
      first.organizationId,
    );

    assert.equal(
      items.some(
        (invitation: { email: string }) =>
          invitation.email === secondEmail,
      ),
      false,
    );
  });

  it("orders invitations by newest first", async () => {
    const { agent, organizationId } =
      await createAuthenticatedAgent();

    const firstEmail =
      `invite-order-first-${randomUUID()}@example.com`;

    const secondEmail =
      `invite-order-second-${randomUUID()}@example.com`;

    const firstResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: firstEmail,
        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(
      firstResponse.status,
      201,
      JSON.stringify(firstResponse.body),
    );

    // Set an explicit earlier timestamp instead of relying on a
    // delay between requests to establish ordering.
    await prisma.membershipInvitation.update({
      where: {
        id: firstResponse.body.data.invitation.id,
      },

      data: {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    const secondResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: secondEmail,
        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(
      secondResponse.status,
      201,
      JSON.stringify(secondResponse.body),
    );

    const response = await agent.get(
      `/api/v1/organizations/${organizationId}/membership-invitations?page=1&pageSize=100`,
    );

    assert.equal(response.status, 200);

    const items = response.body.data.items;

    assert.equal(items.length, 2);
    assert.equal(items[0].email, secondEmail);
    assert.equal(items[1].email, firstEmail);
  });
});

//************************************************************** */