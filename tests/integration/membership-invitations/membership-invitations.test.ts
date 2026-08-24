import assert from "node:assert/strict";

import { describe, it } from "node:test";

import request from "supertest";

import {
  MembershipRole,
  MembershipStatus,
} from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import { app } from "../../../src/app.js";

import { hashPassword } from "../../../src/modules/auth/security/password.service.js";

import { hashToken } from "../../../src/modules/auth/tokens/token.crypto.js";

import { getPermissionsForRole } from "../../../src/modules/permissions/permission.utils.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

const INVITED_USER_PASSWORD = "MotoDeskInvite123!";

//************************************************************** */

async function createRegisteredUser(prefix: string = "membership-invite") {
  const suffix = `${Date.now()}-${Math.random()}`;

  const email = `${prefix}-${suffix}@motodesk.local`;

  const passwordHash = await hashPassword(INVITED_USER_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Invited",
      lastName: "Employee",
      isActive: true,
    },
  });

  return {
    user,
    password: INVITED_USER_PASSWORD,
  };
}

//************************************************************** */

async function createUserAgent(email: string, password: string) {
  const agent = request.agent(app);

  const loginResponse = await agent.post("/api/v1/auth/login").send({
    email,
    password,
  });

  assert.equal(loginResponse.status, 200);

  assert.equal(loginResponse.body.success, true);

  return agent;
}

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

    assert.equal(response.status, 201);

    assert.equal(response.body.success, true);

    const result = response.body.data;

    assert.equal(result.invitation.organizationId, organizationId);

    assert.equal(result.invitation.invitedByMembershipId, ownerMembershipId);

    assert.equal(result.invitation.email, user.email);

    assert.equal(result.invitation.role, MembershipRole.TECHNICIAN);

    assert.equal(typeof result.token, "string");

    assert.equal(result.token.length > 0, true);

    const storedInvitation = await prisma.membershipInvitation.findUnique({
      where: {
        id: result.invitation.id,
      },
    });

    assert.ok(storedInvitation);

    assert.notEqual(storedInvitation.tokenHash, result.token);

    assert.equal(storedInvitation.tokenHash, hashToken(result.token));

    assert.equal(storedInvitation.acceptedAt, null);

    assert.equal(storedInvitation.revokedAt, null);
  });

  //************************************************************** */

  it("rejects a duplicate pending invitation for the same organization and email", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const { user } = await createRegisteredUser("duplicate-invite");

    const firstResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: user.email,

        role: MembershipRole.PARTS,
      });

    assert.equal(firstResponse.status, 201);

    const secondResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
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

  //************************************************************** */

  it("rejects an invitation when the user is already a member of the organization", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

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

  //************************************************************** */

  it("revokes an active membership invitation", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const { user } = await createRegisteredUser("revoke-invite");

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: user.email,

        role: MembershipRole.SERVICE_ADVISOR,
      });

    assert.equal(createResponse.status, 201);

    const invitationId = createResponse.body.data.invitation.id;

    const revokeResponse = await agent.delete(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}`,
    );

    assert.equal(revokeResponse.status, 200);

    assert.equal(revokeResponse.body.success, true);

    const invitation = await prisma.membershipInvitation.findUnique({
      where: {
        id: invitationId,
      },
    });

    assert.ok(invitation);

    assert.notEqual(invitation.revokedAt, null);

    assert.equal(invitation.acceptedAt, null);
  });

  //************************************************************** */

  it("accepts an invitation and provisions the role permission preset", async () => {
    const {
      agent: ownerAgent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const { user, password } = await createRegisteredUser("accept-invite");

    const createResponse = await ownerAgent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: user.email,

        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(createResponse.status, 201);

    const invitationId = createResponse.body.data.invitation.id;

    const token = createResponse.body.data.token;

    const invitedAgent = await createUserAgent(user.email, password);

    const acceptResponse = await invitedAgent
      .post("/api/v1/auth/accept-membership-invitation")
      .send({
        token,
      });

    assert.equal(acceptResponse.status, 200);

    assert.equal(acceptResponse.body.success, true);

    assert.equal(acceptResponse.body.data.organizationId, organizationId);

    assert.equal(acceptResponse.body.data.userId, user.id);

    assert.equal(acceptResponse.body.data.role, MembershipRole.TECHNICIAN);

    assert.equal(acceptResponse.body.data.status, MembershipStatus.ACTIVE);

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,

          organizationId,
        },
      },
    });

    assert.ok(membership);

    assert.equal(membership.role, MembershipRole.TECHNICIAN);

    assert.equal(membership.status, MembershipStatus.ACTIVE);

    const storedPermissions = await prisma.membershipPermission.findMany({
      where: {
        organizationId,

        membershipId: membership.id,
      },

      orderBy: {
        permission: "asc",
      },
    });

    const actualPermissions = storedPermissions.map(
      (permission) => permission.permission,
    );

    const expectedPermissions = getPermissionsForRole(
      MembershipRole.TECHNICIAN,
    );

    assert.deepEqual(
      [...actualPermissions].sort(),
      [...expectedPermissions].sort(),
    );

    assert.equal(
      storedPermissions.every(
        (permission) => permission.grantedByMembershipId === ownerMembershipId,
      ),
      true,
    );

    const invitation = await prisma.membershipInvitation.findUnique({
      where: {
        id: invitationId,
      },
    });

    assert.ok(invitation);

    assert.notEqual(invitation.acceptedAt, null);

    assert.equal(invitation.revokedAt, null);
  });

  //************************************************************** */

  it("rejects invitation acceptance when the authenticated email does not match", async () => {
    const { agent: ownerAgent, organizationId } =
      await createAuthenticatedAgent();

    const invitedUser = await createRegisteredUser("correct-invite-user");

    const otherUser = await createRegisteredUser("wrong-invite-user");

    const createResponse = await ownerAgent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: invitedUser.user.email,

        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(createResponse.status, 201);

    const invitationId = createResponse.body.data.invitation.id;

    const token = createResponse.body.data.token;

    const otherAgent = await createUserAgent(
      otherUser.user.email,
      otherUser.password,
    );

    const response = await otherAgent
      .post("/api/v1/auth/accept-membership-invitation")
      .send({
        token,
      });

    assert.equal(response.status, 403);

    assert.equal(response.body.code, "MEMBERSHIP_INVITATION_EMAIL_MISMATCH");

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: invitedUser.user.id,

          organizationId,
        },
      },
    });

    assert.equal(membership, null);

    const invitation = await prisma.membershipInvitation.findUnique({
      where: {
        id: invitationId,
      },
    });

    assert.ok(invitation);

    assert.equal(invitation.acceptedAt, null);
  });
});

//************************************************************** */
