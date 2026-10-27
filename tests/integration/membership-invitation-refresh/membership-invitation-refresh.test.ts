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
  hashToken,
} from "../../../src/modules/auth/tokens/token.crypto.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

describe("Membership invitation refresh integration", () => {
  it("refreshes an active invitation with a new token and expiration", async () => {
    const { agent, organizationId } =
      await createAuthenticatedAgent();

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: `refresh-invite-${randomUUID()}@example.com`,
        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(
      createResponse.status,
      201,
      JSON.stringify(createResponse.body),
    );

    const invitationId = createResponse.body.data.invitation.id;
    const originalToken = createResponse.body.data.token;

    // Give the invitation a shorter remaining lifetime so the
    // expiration-extension assertion does not depend on timing.
    await prisma.membershipInvitation.update({
      where: { id: invitationId },
      data: {
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const originalInvitation =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitationId },
      });

    const refreshResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}/refresh`,
    );

    assert.equal(
      refreshResponse.status,
      200,
      JSON.stringify(refreshResponse.body),
    );
    assert.equal(refreshResponse.body.success, true);

    const refreshedToken = refreshResponse.body.data.token;

    assert.equal(typeof refreshedToken, "string");
    assert.notEqual(refreshedToken, originalToken);

    const refreshedInvitation =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitationId },
      });

    assert.notEqual(
      refreshedInvitation.tokenHash,
      originalInvitation.tokenHash,
    );

    assert.equal(
      refreshedInvitation.tokenHash,
      hashToken(refreshedToken),
    );

    assert.ok(
      refreshedInvitation.expiresAt.getTime() >
        originalInvitation.expiresAt.getTime(),
    );

    assert.equal(refreshedInvitation.acceptedAt, null);
    assert.equal(refreshedInvitation.revokedAt, null);
  });

  it("invalidates the previous invitation token after refresh", async () => {
    const { agent, organizationId } =
      await createAuthenticatedAgent();

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: `refresh-old-token-${randomUUID()}@example.com`,
        role: MembershipRole.PARTS,
      });

    assert.equal(
      createResponse.status,
      201,
      JSON.stringify(createResponse.body),
    );

    const invitationId = createResponse.body.data.invitation.id;
    const originalToken = createResponse.body.data.token;

    const refreshResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}/refresh`,
    );

    assert.equal(
      refreshResponse.status,
      200,
      JSON.stringify(refreshResponse.body),
    );

    const staleInvitation =
      await prisma.membershipInvitation.findUnique({
        where: {
          tokenHash: hashToken(originalToken),
        },
      });

    assert.equal(staleInvitation, null);
  });

  it("refreshes a revoked invitation and makes it active again", async () => {
    const { agent, organizationId } =
      await createAuthenticatedAgent();

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: `refresh-revoked-${randomUUID()}@example.com`,
        role: MembershipRole.SERVICE_ADVISOR,
      });

    assert.equal(
      createResponse.status,
      201,
      JSON.stringify(createResponse.body),
    );

    const invitationId = createResponse.body.data.invitation.id;

    const revokeResponse = await agent.delete(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}`,
    );

    assert.equal(revokeResponse.status, 200);

    const revokedInvitation =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitationId },
      });

    assert.ok(revokedInvitation.revokedAt);

    const refreshResponse = await agent.post(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}/refresh`,
    );

    assert.equal(
      refreshResponse.status,
      200,
      JSON.stringify(refreshResponse.body),
    );

    const refreshedInvitation =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitationId },
      });

    assert.equal(refreshedInvitation.revokedAt, null);
    assert.equal(refreshedInvitation.acceptedAt, null);
    assert.ok(
      refreshedInvitation.expiresAt.getTime() > Date.now(),
    );
  });

  it("rejects refreshing an accepted invitation", async () => {
    const { agent, organizationId } =
      await createAuthenticatedAgent();

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: `refresh-accepted-${randomUUID()}@example.com`,
        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(
      createResponse.status,
      201,
      JSON.stringify(createResponse.body),
    );

    const invitationId = createResponse.body.data.invitation.id;

    await prisma.membershipInvitation.update({
      where: { id: invitationId },
      data: {
        acceptedAt: new Date(),
      },
    });

    const response = await agent.post(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}/refresh`,
    );

    assert.equal(response.status, 409);
    assert.equal(
      response.body.code,
      "MEMBERSHIP_INVITATION_ALREADY_ACCEPTED",
    );
  });

  it("returns not found for an invitation outside the organization", async () => {
    const first = await createAuthenticatedAgent();
    const second = await createAuthenticatedAgent();

    const invitation = await prisma.membershipInvitation.create({
      data: {
        organizationId: second.organizationId,
        invitedByMembershipId: second.membershipId,
        email: `refresh-cross-org-${randomUUID()}@example.com`,
        role: MembershipRole.TECHNICIAN,
        tokenHash: randomUUID(),
        expiresAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1_000,
        ),
      },
    });

    const response = await first.agent.post(
      `/api/v1/organizations/${first.organizationId}/membership-invitations/${invitation.id}/refresh`,
    );

    assert.equal(response.status, 404);
    assert.equal(
      response.body.code,
      "MEMBERSHIP_INVITATION_NOT_FOUND",
    );

    const unchanged =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });

    assert.equal(unchanged.tokenHash, invitation.tokenHash);
    assert.equal(
      unchanged.expiresAt.getTime(),
      invitation.expiresAt.getTime(),
    );
    assert.equal(unchanged.acceptedAt, null);
    assert.equal(unchanged.revokedAt, null);
  });
});

//************************************************************** */