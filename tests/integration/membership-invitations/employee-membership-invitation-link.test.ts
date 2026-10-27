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
  getPermissionsForRole,
} from "../../../src/modules/permissions/permission.utils.js";

import {
  createAuthenticatedAgent,
} from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

const INVITED_USER_PASSWORD = "MotoDeskInvite123!";
const createdUserIds: string[] = [];

async function createRegisteredUser() {
  const user = await prisma.user.create({
    data: {
      email: `employee-linked-${randomUUID()}@example.com`,
      passwordHash: await hashPassword(INVITED_USER_PASSWORD),
      firstName: "Linked",
      lastName: "Employee",
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  createdUserIds.push(user.id);

  return user;
}

async function createUserAgent(email: string) {
  const agent = request.agent(app);

  const response = await agent
    .post("/api/v1/auth/login")
    .send({
      email,
      password: INVITED_USER_PASSWORD,
    });

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
      actorUserId: { in: createdUserIds },
    },
  });

  await prisma.user.deleteMany({
    where: {
      id: { in: createdUserIds },
    },
  });
});

//************************************************************** */

describe("Employee membership invitation linkage", () => {
  it("links the accepted membership back to the employee in the invitation acceptance transaction", async () => {
    const {
      agent: ownerAgent,
      organizationId,
      membershipId: ownerMembershipId,
    } = await createAuthenticatedAgent();

    const user = await createRegisteredUser();

    const employeeResponse = await ownerAgent
      .post(`/api/v1/organizations/${organizationId}/employees`)
      .send({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: "TECHNICIAN",
        status: "ACTIVE",
        hourlyRate: 30,
        laborRate: 130,
      });

    assert.equal(
      employeeResponse.status,
      201,
      JSON.stringify(employeeResponse.body),
    );
    assert.equal(employeeResponse.body.success, true);

    const employee = employeeResponse.body.data;

    assert.equal(employee.email, user.email);
    assert.equal(employee.membershipId, null);

    const invitationResponse = await ownerAgent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        employeeId: employee.id,
        email: user.email,
        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(
      invitationResponse.status,
      201,
      JSON.stringify(invitationResponse.body),
    );
    assert.equal(invitationResponse.body.success, true);

    const { invitation, token } = invitationResponse.body.data;

    assert.equal(invitation.organizationId, organizationId);
    assert.equal(invitation.email, user.email);
    assert.equal(invitation.role, MembershipRole.TECHNICIAN);
    assert.equal(typeof token, "string");
    assert.ok(token.length > 0);

    const before =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });

    assert.equal(before.employeeId, employee.id);
    assert.equal(before.acceptedAt, null);

    const invitedAgent = await createUserAgent(user.email);

    const acceptResponse = await invitedAgent
      .post("/api/v1/auth/accept-membership-invitation")
      .send({ token });

    assert.equal(
      acceptResponse.status,
      200,
      JSON.stringify(acceptResponse.body),
    );
    assert.equal(acceptResponse.body.success, true);

    const acceptedMembership = acceptResponse.body.data;

    assert.equal(acceptedMembership.organizationId, organizationId);
    assert.equal(acceptedMembership.userId, user.id);
    assert.equal(
      acceptedMembership.role,
      MembershipRole.TECHNICIAN,
    );
    assert.equal(
      acceptedMembership.status,
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

    assert.equal(membership.id, acceptedMembership.id);
    assert.equal(membership.role, MembershipRole.TECHNICIAN);
    assert.equal(membership.status, MembershipStatus.ACTIVE);

    const linkedEmployee = await prisma.employee.findUniqueOrThrow({
      where: { id: employee.id },

      include: {
        membership: {
          include: {
            user: true,
          },
        },
      },
    });

    assert.equal(linkedEmployee.membershipId, membership.id);
    assert.ok(linkedEmployee.membership);
    assert.equal(linkedEmployee.membership.id, membership.id);
    assert.equal(linkedEmployee.membership.user.id, user.id);
    assert.equal(linkedEmployee.membership.user.email, user.email);

    const storedPermissions =
      await prisma.membershipPermission.findMany({
        where: {
          organizationId,
          membershipId: membership.id,
        },

        orderBy: {
          permission: "asc",
        },
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

    const after =
      await prisma.membershipInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });

    assert.equal(after.employeeId, employee.id);
    assert.ok(after.acceptedAt);
    assert.equal(after.revokedAt, null);
  });

  it("rejects an employee invitation when the invitation email does not match the employee email", async () => {
    const {
      agent,
      organizationId,
    } = await createAuthenticatedAgent();

    const suffix = randomUUID();

    const employeeResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/employees`)
      .send({
        firstName: "Email",
        lastName: "Mismatch",
        email: `employee-${suffix}@example.com`,
        role: "SERVICE_ADVISOR",
      });

    assert.equal(
      employeeResponse.status,
      201,
      JSON.stringify(employeeResponse.body),
    );

    const employee = employeeResponse.body.data;

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        employeeId: employee.id,
        email: `different-${suffix}@example.com`,
        role: MembershipRole.SERVICE_ADVISOR,
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.equal(
      response.body.code,
      "EMPLOYEE_INVITATION_EMAIL_MISMATCH",
    );

    assert.equal(
      await prisma.membershipInvitation.count({
        where: {
          organizationId,
          employeeId: employee.id,
        },
      }),
      0,
    );
  });

  it("rejects an employee invitation when the employee is already linked to a membership", async () => {
    const {
      agent,
      organizationId,
    } = await createAuthenticatedAgent();

    const user = await createRegisteredUser();

    const membership = await prisma.membership.create({
      data: {
        organizationId,
        userId: user.id,
        role: MembershipRole.TECHNICIAN,
        status: MembershipStatus.ACTIVE,
      },
    });

    const employeeResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/employees`)
      .send({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: "TECHNICIAN",
        membershipId: membership.id,
      });

    assert.equal(
      employeeResponse.status,
      201,
      JSON.stringify(employeeResponse.body),
    );

    const employee = employeeResponse.body.data;

    assert.equal(employee.membershipId, membership.id);

    const response = await agent
      .post(`/api/v1/organizations/${organizationId}/membership-invitations`)
      .send({
        employeeId: employee.id,
        email: user.email,
        role: MembershipRole.TECHNICIAN,
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.success, false);
    assert.equal(
      response.body.code,
      "EMPLOYEE_MEMBERSHIP_ALREADY_LINKED",
    );
  });
});

//************************************************************** */