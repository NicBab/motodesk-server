import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  after,
  describe,
  it,
} from "node:test";

import request from "supertest";

import {
  MembershipRole,
  MembershipStatus,
} from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";
import { app } from "../../../src/app.js";

import {
  hashPassword,
} from "../../../src/modules/auth/security/password.service.js";

import {
  hashToken,
} from "../../../src/modules/auth/tokens/token.crypto.js";

import {
  getPermissionsForRole,
} from "../../../src/modules/permissions/permission.utils.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

const INVITED_USER_PASSWORD = "MotoDeskInvite123!";
const createdUserIds: string[] = [];

async function createRegisteredUser(
  prefix = "membership-invite",
) {
  const user = await prisma.user.create({
    data: {
      email: `${prefix}-${randomUUID()}@example.com`.toLowerCase(),
      passwordHash: await hashPassword(INVITED_USER_PASSWORD),
      firstName: "Invited",
      lastName: "Employee",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  createdUserIds.push(user.id);

  return {
    user,
    password: INVITED_USER_PASSWORD,
  };
}

async function createUserAgent(
  email: string,
  password: string,
) {
  const agent = request.agent(app);

  const response = await agent
    .post("/api/v1/auth/login")
    .send({ email, password });

  assert.equal(
    response.status,
    200,
    JSON.stringify(response.body),
  );

  assert.equal(response.body.success, true);

  const header = response.headers["set-cookie"];

  const lines = Array.isArray(header)
    ? header.map(String)
    : typeof header === "string"
      ? [header]
      : [];

  const cookie = lines.find((line) =>
    line.startsWith("motodesk_access_token="),
  );

  assert.ok(cookie, "Expected client access cookie.");

  agent.set("Cookie", cookie.split(";")[0]!);

  return agent;
}

after(async () => {
  if (createdUserIds.length === 0) {
    return;
  }

  await prisma.auditLog.deleteMany({
    where: {
      actorUserId: {
        in: createdUserIds,
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      id: {
        in: createdUserIds,
      },
    },
  });
});

//************************************************************** */

describe("Membership invitations integration", () => {
  it("creates a membership invitation and stores only the token hash", async () => {
    const {
      agent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const { user } = await createRegisteredUser();

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: user.email,
        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(
      response.status,
      201,
      JSON.stringify(response.body),
    );
    assert.equal(response.body.success, true);

    const result = response.body.data;

    assert.equal(result.invitation.organizationId, organizationId);
    assert.equal(
      result.invitation.invitedByMembershipId,
      ownerMembershipId,
    );
    assert.equal(result.invitation.email, user.email);
    assert.equal(result.invitation.role, MembershipRole.TECHNICIAN);
    assert.equal(typeof result.token, "string");
    assert.ok(result.token.length > 0);

    const storedInvitation =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: result.invitation.id },
      });

    assert.notEqual(storedInvitation.tokenHash, result.token);
    assert.equal(
      storedInvitation.tokenHash,
      hashToken(result.token),
    );
    assert.equal(storedInvitation.acceptedAt, null);
    assert.equal(storedInvitation.revokedAt, null);
  });

  it("rejects a duplicate pending invitation for the same organization and email", async () => {
    const { agent, organizationId } =
      await createAuthenticatedAgent();

    const { user } = await createRegisteredUser("duplicate-invite");

    const endpoint =
      `/api/v1/organizations/${organizationId}/membership-invitations`;

    const firstResponse = await agent
      .post(endpoint)
      .send({
        email: user.email,
        role: MembershipRole.PARTS,
      });

    assert.equal(
      firstResponse.status,
      201,
      JSON.stringify(firstResponse.body),
    );

    const secondResponse = await agent
      .post(endpoint)
      .send({
        email: user.email,
        role: MembershipRole.PARTS,
      });

    assert.equal(secondResponse.status, 409);
    assert.equal(
      secondResponse.body.code,
      "MEMBERSHIP_INVITATION_ALREADY_EXISTS",
    );
  });

  it("rejects an invitation when the user is already a member of the organization", async () => {
    const { agent, organizationId } =
      await createAuthenticatedAgent();

    const { user } = await createRegisteredUser("existing-member");

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        role: MembershipRole.TECHNICIAN,
        status: MembershipStatus.ACTIVE,
      },
    });

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: user.email,
        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "MEMBERSHIP_ALREADY_EXISTS");
  });

  it("revokes an active membership invitation", async () => {
    const { agent, organizationId } =
      await createAuthenticatedAgent();

    const { user } = await createRegisteredUser("revoke-invite");

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: user.email,
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
    assert.equal(revokeResponse.body.success, true);

    const invitation =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitationId },
      });

    assert.ok(invitation.revokedAt);
    assert.equal(invitation.acceptedAt, null);
  });

  it("accepts an invitation and provisions the role permission preset", async () => {
    const {
      agent: ownerAgent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const { user, password } =
      await createRegisteredUser("accept-invite");

    const createResponse = await ownerAgent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: user.email,
        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(
      createResponse.status,
      201,
      JSON.stringify(createResponse.body),
    );

    const { invitation, token } = createResponse.body.data;
    const invitedAgent = await createUserAgent(user.email, password);

    const acceptResponse = await invitedAgent
      .post("/api/v1/auth/accept-membership-invitation")
      .send({ token });

    assert.equal(
      acceptResponse.status,
      200,
      JSON.stringify(acceptResponse.body),
    );
    assert.equal(acceptResponse.body.success, true);
    assert.equal(acceptResponse.body.data.organizationId, organizationId);
    assert.equal(acceptResponse.body.data.userId, user.id);
    assert.equal(
      acceptResponse.body.data.role,
      MembershipRole.TECHNICIAN,
    );
    assert.equal(
      acceptResponse.body.data.status,
      MembershipStatus.ACTIVE,
    );

    const membership = await prisma.membership.findUniqueOrThrow({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
      },
    });

    assert.equal(membership.role, MembershipRole.TECHNICIAN);
    assert.equal(membership.status, MembershipStatus.ACTIVE);

    const storedPermissions =
      await prisma.membershipPermission.findMany({
        where: {
          organizationId,
          membershipId: membership.id,
        },
        orderBy: { permission: "asc" },
      });

    assert.deepEqual(
      storedPermissions.map((item) => item.permission).sort(),
      [...getPermissionsForRole(MembershipRole.TECHNICIAN)].sort(),
    );

    assert.equal(
      storedPermissions.every(
        (item) =>
          item.grantedByMembershipId === ownerMembershipId,
      ),
      true,
    );

    const accepted =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });

    assert.ok(accepted.acceptedAt);
    assert.equal(accepted.revokedAt, null);
  });

  it("rejects invitation acceptance when the authenticated email does not match", async () => {
    const {
      agent: ownerAgent,
      organizationId,
    } = await createAuthenticatedAgent();

    const invitedUser =
      await createRegisteredUser("correct-invite-user");

    const otherUser =
      await createRegisteredUser("wrong-invite-user");

    const createResponse = await ownerAgent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: invitedUser.user.email,
        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(
      createResponse.status,
      201,
      JSON.stringify(createResponse.body),
    );

    const { invitation, token } = createResponse.body.data;

    const otherAgent = await createUserAgent(
      otherUser.user.email,
      otherUser.password,
    );

    const response = await otherAgent
      .post("/api/v1/auth/accept-membership-invitation")
      .send({ token });

    assert.equal(response.status, 403);
    assert.equal(
      response.body.code,
      "MEMBERSHIP_INVITATION_EMAIL_MISMATCH",
    );

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: invitedUser.user.id,
          organizationId,
        },
      },
    });

    assert.equal(membership, null);

    const unchanged =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });

    assert.equal(unchanged.acceptedAt, null);
  });
});

//************************************************************** */