import assert from "node:assert/strict";

import { describe, it } from "node:test";

import { MembershipRole } from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import { hashToken } from "../../../src/modules/auth/tokens/token.crypto.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

describe("Membership invitation refresh integration", () => {
  it("refreshes an active invitation with a new token and expiration", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const email = `refresh-invite-${Date.now()}@motodesk.local`;

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email,

        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(createResponse.status, 201);

    const invitationId = createResponse.body.data.invitation.id;

    const originalToken = createResponse.body.data.token;

    const originalInvitation =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: {
          id: invitationId,
        },
      });

    const refreshResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}/refresh`,
    );

    assert.equal(refreshResponse.status, 200);

    assert.equal(refreshResponse.body.success, true);

    const refreshedToken = refreshResponse.body.data.token;

    assert.equal(typeof refreshedToken, "string");

    assert.notEqual(refreshedToken, originalToken);

    const refreshedInvitation =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: {
          id: invitationId,
        },
      });

    assert.notEqual(
      refreshedInvitation.tokenHash,
      originalInvitation.tokenHash,
    );

    assert.equal(refreshedInvitation.tokenHash, hashToken(refreshedToken));

    assert.equal(
      refreshedInvitation.expiresAt.getTime() >
        originalInvitation.expiresAt.getTime(),
      true,
    );

    assert.equal(refreshedInvitation.acceptedAt, null);

    assert.equal(refreshedInvitation.revokedAt, null);
  });

  //************************************************************** */

  it("invalidates the previous invitation token after refresh", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const email = `refresh-old-token-${Date.now()}@motodesk.local`;

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email,

        role: MembershipRole.PARTS,
      });

    assert.equal(createResponse.status, 201);

    const invitationId = createResponse.body.data.invitation.id;

    const originalToken = createResponse.body.data.token;

    const refreshResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}/refresh`,
    );

    assert.equal(refreshResponse.status, 200);

    const originalTokenHash = hashToken(originalToken);

    const staleInvitation = await prisma.membershipInvitation.findUnique({
      where: {
        tokenHash: originalTokenHash,
      },
    });

    assert.equal(staleInvitation, null);
  });

  //************************************************************** */

  it("refreshes a revoked invitation and makes it active again", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const email = `refresh-revoked-${Date.now()}@motodesk.local`;

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email,

        role: MembershipRole.SERVICE_ADVISOR,
      });

    assert.equal(createResponse.status, 201);

    const invitationId = createResponse.body.data.invitation.id;

    const revokeResponse = await agent.delete(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}`,
    );

    assert.equal(revokeResponse.status, 200);

    const revokedInvitation =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: {
          id: invitationId,
        },
      });

    assert.notEqual(revokedInvitation.revokedAt, null);

    const refreshResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}/refresh`,
    );

    assert.equal(refreshResponse.status, 200);

    const refreshedInvitation =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: {
          id: invitationId,
        },
      });

    assert.equal(refreshedInvitation.revokedAt, null);

    assert.equal(refreshedInvitation.acceptedAt, null);

    assert.equal(refreshedInvitation.expiresAt.getTime() > Date.now(), true);
  });

  //************************************************************** */

  it("rejects refreshing an accepted invitation", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const email = `refresh-accepted-${Date.now()}@motodesk.local`;

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email,

        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(createResponse.status, 201);

    const invitationId = createResponse.body.data.invitation.id;

    await prisma.membershipInvitation.update({
      where: {
        id: invitationId,
      },

      data: {
        acceptedAt: new Date(),
      },
    });

    const response = await agent.post(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}/refresh`,
    );

    assert.equal(response.status, 409);

    assert.equal(response.body.code, "MEMBERSHIP_INVITATION_ALREADY_ACCEPTED");
  });

  //************************************************************** */

  it("returns not found for an invitation outside the organization", async () => {
    const first = await createAuthenticatedAgent();

    const ownerMembership = await prisma.membership.findUniqueOrThrow({
      where: {
        id: first.membershipId,
      },
    });

    const secondOrganization = await prisma.organization.create({
      data: {
        name: `Refresh Scope ${Date.now()}`,

        slug: `refresh-scope-${Date.now()}-${Math.random()}`,
      },
    });

    const secondMembership = await prisma.membership.create({
      data: {
        organizationId: secondOrganization.id,

        userId: ownerMembership.userId,

        role: MembershipRole.OWNER,

        status: "ACTIVE",
      },
    });

    const invitation = await prisma.membershipInvitation.create({
      data: {
        organizationId: secondOrganization.id,

        invitedByMembershipId: secondMembership.id,

        email: `refresh-cross-org-${Date.now()}@motodesk.local`,

        role: MembershipRole.TECHNICIAN,

        tokenHash: `refresh-cross-org-token-${Date.now()}-${Math.random()}`,

        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      },
    });

    const response = await first.agent.post(
      `/api/v1/organizations/${first.organizationId}/membership-invitations/${invitation.id}/refresh`,
    );

    assert.equal(response.status, 404);

    assert.equal(response.body.code, "MEMBERSHIP_INVITATION_NOT_FOUND");
  });
});

//************************************************************** */
