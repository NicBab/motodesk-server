import assert from "node:assert/strict";

import { describe, it } from "node:test";

import request from "supertest";

import { MembershipRole } from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import { app } from "../../../src/app.js";

import { hashPassword } from "../../../src/modules/auth/security/password.service.js";

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "../../../src/modules/audit/audit.constants.js";

import { createAuthenticatedAgent } from "../helpers/authenticated-agent.js";

//************************************************************** */

const TEST_PASSWORD = "MotoDeskAudit123!";

//************************************************************** */

async function createRegisteredUser(prefix: string) {
  const suffix = `${Date.now()}-${Math.random()}`;

  const email = `${prefix}-${suffix}@motodesk.local`;

  const passwordHash = await hashPassword(TEST_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Audit",
      lastName: "Employee",
      isActive: true,
    },
  });

  return {
    user,
    password: TEST_PASSWORD,
  };
}

//************************************************************** */

async function createUserAgent(email: string, password: string) {
  const agent = request.agent(app);

  const response = await agent.post("/api/v1/auth/login").send({
    email,
    password,
  });

  assert.equal(response.status, 200);

  assert.equal(response.body.success, true);

  return agent;
}

//************************************************************** */

describe("Membership and invitation audit integration", () => {
  it("records membership creation", async () => {
    const {
      agent,
      organizationId,
      membershipId: actorMembershipId,
    } = await createAuthenticatedAgent();

    const { user } = await createRegisteredUser("membership-audit-create");

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/memberships`)
      .send({
        email: user.email,

        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(response.status, 201);

    const membershipId = response.body.data.id;

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId,

        action: AUDIT_ACTIONS.MEMBERSHIP_CREATED,

        resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,

        resourceId: membershipId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(auditLog);

    const metadata = auditLog.metadata as Record<string, unknown>;

    assert.equal(metadata.actorMembershipId, actorMembershipId);

    assert.ok(metadata.after);
  });

  //************************************************************** */

  it("records membership suspension", async () => {
    const { agent, organizationId } = await createAuthenticatedAgent();

    const { user } = await createRegisteredUser("membership-audit-suspend");

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/memberships`)
      .send({
        email: user.email,

        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(createResponse.status, 201);

    const membershipId = createResponse.body.data.id;

    const response = await agent
      .patch(
        `/api/v1/organizations/${organizationId}/memberships/${membershipId}`,
      )
      .send({
        status: "SUSPENDED",
      });

    assert.equal(response.status, 200);

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId,

        action: AUDIT_ACTIONS.MEMBERSHIP_SUSPENDED,

        resourceType: AUDIT_ENTITY_TYPES.MEMBERSHIP,

        resourceId: membershipId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(auditLog);

    const metadata = auditLog.metadata as Record<string, unknown>;

    assert.equal(metadata.statusChanged, true);

    assert.equal(metadata.roleChanged, false);

    assert.ok(metadata.before);

    assert.ok(metadata.after);
  });

  //************************************************************** */

  it("records membership invitation creation", async () => {
    const {
      agent,
      organizationId,
      membershipId: actorMembershipId,
    } = await createAuthenticatedAgent();

    const { user } = await createRegisteredUser("invitation-audit-create");

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: user.email,

        role: MembershipRole.PARTS,
      });

    assert.equal(response.status, 201);

    const invitationId = response.body.data.invitation.id;

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId,

        action: AUDIT_ACTIONS.INVITATION_CREATED,

        resourceType: AUDIT_ENTITY_TYPES.INVITATION,

        resourceId: invitationId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(auditLog);

    const metadata = auditLog.metadata as Record<string, unknown>;

    assert.equal(metadata.actorMembershipId, actorMembershipId);

    assert.ok(metadata.after);

    // Raw invitation token must never
    // be persisted in the audit log.
    assert.equal(
      JSON.stringify(auditLog.metadata).includes(response.body.data.token),
      false,
    );
  });

  //************************************************************** */

  it("records membership invitation revocation", async () => {
    const {
      agent,
      organizationId,
      membershipId: actorMembershipId,
    } = await createAuthenticatedAgent();

    const { user } = await createRegisteredUser("invitation-audit-revoke");

    const createResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        email: user.email,

        role: MembershipRole.SERVICE_ADVISOR,
      });

    assert.equal(createResponse.status, 201);

    const invitationId = createResponse.body.data.invitation.id;

    const response = await agent.delete(
      `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}`,
    );

    assert.equal(response.status, 200);

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId,

        action: AUDIT_ACTIONS.INVITATION_REVOKED,

        resourceType: AUDIT_ENTITY_TYPES.INVITATION,

        resourceId: invitationId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(auditLog);

    const metadata = auditLog.metadata as Record<string, unknown>;

    assert.equal(metadata.actorMembershipId, actorMembershipId);

    assert.ok(metadata.before);

    assert.ok(metadata.after);
  });

  //************************************************************** */

  it("records membership invitation acceptance", async () => {
    const {
      agent: ownerAgent,
      organizationId,
      membershipId: invitedByMembershipId,
    } = await createAuthenticatedAgent();

    const { user, password } = await createRegisteredUser(
      "invitation-audit-accept",
    );

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

    const response = await invitedAgent
      .post("/api/v1/auth/accept-membership-invitation")
      .send({
        token,
      });

    assert.equal(response.status, 200);

    const membershipId = response.body.data.id;

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId,

        actorUserId: user.id,

        action: AUDIT_ACTIONS.INVITATION_ACCEPTED,

        resourceType: AUDIT_ENTITY_TYPES.INVITATION,

        resourceId: invitationId,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    assert.ok(auditLog);

    const metadata = auditLog.metadata as Record<string, unknown>;

    assert.equal(metadata.invitedByMembershipId, invitedByMembershipId);

    const after = metadata.after as Record<string, unknown>;

    assert.equal(after.membershipId, membershipId);

    assert.equal(after.membershipRole, MembershipRole.TECHNICIAN);

    assert.equal(JSON.stringify(auditLog.metadata).includes(token), false);
  });
});

//************************************************************** */
