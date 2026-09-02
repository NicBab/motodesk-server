import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import request from "supertest";

import {
  MembershipRole,
  MembershipStatus,
} from "../../../src/generated/prisma/client.js";

import {
  prisma,
} from "../../../src/config/prisma.js";

import {
  app,
} from "../../../src/app.js";

import {
  hashPassword,
} from "../../../src/modules/auth/security/password.service.js";

import {
  getPermissionsForRole,
} from "../../../src/modules/permissions/permission.utils.js";

import {
  createAuthenticatedAgent,
} from "../helpers/authenticated-agent.js";

//************************************************************** */

const INVITED_USER_PASSWORD =
  "MotoDeskInvite123!";

//************************************************************** */

async function createRegisteredUser() {
  const suffix =
    `${Date.now()}-${Math.random()}`;

  const email =
    `employee-linked-invite-${suffix}@motodesk.local`;

  const passwordHash =
    await hashPassword(
      INVITED_USER_PASSWORD,
    );

  const user =
    await prisma.user.create({
      data: {
        email,

        passwordHash,

        firstName:
          "Linked",

        lastName:
          "Employee",

        isActive:
          true,
      },
    });

  return {
    user,

    password:
      INVITED_USER_PASSWORD,
  };
}

//************************************************************** */

async function createUserAgent(
  email: string,
  password: string,
) {
  const agent =
    request.agent(
      app,
    );

  const response =
    await agent
      .post(
        "/api/v1/auth/login",
      )
      .send({
        email,

        password,
      });

  assert.equal(
    response.status,
    200,
  );

  assert.equal(
    response.body.success,
    true,
  );

  return agent;
}

//************************************************************** */

describe(
  "Employee membership invitation linkage",
  () => {
    it(
      "links the accepted membership back to the employee in the invitation acceptance transaction",
      async () => {
        const {
          agent:
            ownerAgent,

          organizationId,

          membershipId:
            ownerMembershipId,
        } =
          await createAuthenticatedAgent();

        const {
          user,
          password,
        } =
          await createRegisteredUser();

        //************************************************************** */
        // Create Employee without application membership.

        const employeeResponse =
          await ownerAgent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                user.firstName,

              lastName:
                user.lastName,

              email:
                user.email,

              role:
                "TECHNICIAN",

              status:
                "ACTIVE",

              hourlyRate:
                30,

              laborRate:
                130,
            });

        assert.equal(
          employeeResponse.status,
          201,
        );

        assert.equal(
          employeeResponse.body.success,
          true,
        );

        const employee =
          employeeResponse.body.data;

        assert.equal(
          employee.email,
          user.email,
        );

        assert.equal(
          employee.membershipId,
          null,
        );

        //************************************************************** */
        // Create invitation explicitly tied to Employee.

        const invitationResponse =
          await ownerAgent
            .post(
              `/api/v1/organizations/${organizationId}/membership-invitations`,
            )
            .send({
              employeeId:
                employee.id,

              email:
                user.email,

              role:
                MembershipRole.TECHNICIAN,
            });

        assert.equal(
          invitationResponse.status,
          201,
        );

        assert.equal(
          invitationResponse.body.success,
          true,
        );

        const {
          invitation,
          token,
        } =
          invitationResponse.body.data;

        assert.equal(
          invitation.organizationId,
          organizationId,
        );

        assert.equal(
          invitation.email,
          user.email,
        );

        assert.equal(
          invitation.role,
          MembershipRole.TECHNICIAN,
        );

        assert.equal(
          typeof token,
          "string",
        );

        assert.equal(
          token.length >
            0,
          true,
        );

        //************************************************************** */
        // Verify durable employee target stored on invitation.

        const storedInvitationBeforeAccept =
          await prisma.membershipInvitation.findUniqueOrThrow({
            where: {
              id:
                invitation.id,
            },
          });

        assert.equal(
          storedInvitationBeforeAccept.employeeId,
          employee.id,
        );

        assert.equal(
          storedInvitationBeforeAccept.acceptedAt,
          null,
        );

        //************************************************************** */
        // Invited user accepts.

        const invitedAgent =
          await createUserAgent(
            user.email,
            password,
          );

        const acceptResponse =
          await invitedAgent
            .post(
              "/api/v1/auth/accept-membership-invitation",
            )
            .send({
              token,
            });

        assert.equal(
          acceptResponse.status,
          200,
        );

        assert.equal(
          acceptResponse.body.success,
          true,
        );

        const acceptedMembership =
          acceptResponse.body.data;

        assert.equal(
          acceptedMembership.organizationId,
          organizationId,
        );

        assert.equal(
          acceptedMembership.userId,
          user.id,
        );

        assert.equal(
          acceptedMembership.role,
          MembershipRole.TECHNICIAN,
        );

        assert.equal(
          acceptedMembership.status,
          MembershipStatus.ACTIVE,
        );

        //************************************************************** */
        // Membership persisted.

        const membership =
          await prisma.membership.findUniqueOrThrow({
            where: {
              userId_organizationId: {
                userId:
                  user.id,

                organizationId,
              },
            },
          });

        assert.equal(
          membership.id,
          acceptedMembership.id,
        );

        assert.equal(
          membership.role,
          MembershipRole.TECHNICIAN,
        );

        assert.equal(
          membership.status,
          MembershipStatus.ACTIVE,
        );

        //************************************************************** */
        // Employee now points directly to Membership.

        const linkedEmployee =
          await prisma.employee.findUniqueOrThrow({
            where: {
              id:
                employee.id,
            },

            include: {
              membership: {
                include: {
                  user:
                    true,
                },
              },
            },
          });

        assert.equal(
          linkedEmployee.membershipId,
          membership.id,
        );

        assert.ok(
          linkedEmployee.membership,
        );

        assert.equal(
          linkedEmployee.membership.id,
          membership.id,
        );

        assert.equal(
          linkedEmployee.membership.user.id,
          user.id,
        );

        assert.equal(
          linkedEmployee.membership.user.email,
          user.email,
        );

        //************************************************************** */
        // Role-default permissions provisioned.

        const storedPermissions =
          await prisma.membershipPermission.findMany({
            where: {
              organizationId,

              membershipId:
                membership.id,
            },

            orderBy: {
              permission:
                "asc",
            },
          });

        const actualPermissions =
          storedPermissions.map(
            (
              permission,
            ) =>
              permission.permission,
          );

        const expectedPermissions =
          getPermissionsForRole(
            MembershipRole.TECHNICIAN,
          );

        assert.deepEqual(
          [
            ...actualPermissions,
          ].sort(),
          [
            ...expectedPermissions,
          ].sort(),
        );

        assert.equal(
          storedPermissions.every(
            (
              permission,
            ) =>
              permission.grantedByMembershipId ===
              ownerMembershipId,
          ),
          true,
        );

        //************************************************************** */
        // Invitation marked accepted.

        const storedInvitationAfterAccept =
          await prisma.membershipInvitation.findUniqueOrThrow({
            where: {
              id:
                invitation.id,
            },
          });

        assert.equal(
          storedInvitationAfterAccept.employeeId,
          employee.id,
        );

        assert.notEqual(
          storedInvitationAfterAccept.acceptedAt,
          null,
        );

        assert.equal(
          storedInvitationAfterAccept.revokedAt,
          null,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects an employee invitation when the invitation email does not match the employee email",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          `${Date.now()}-${Math.random()}`;

        const employeeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                "Email",

              lastName:
                "Mismatch",

              email:
                `employee-${suffix}@motodesk.local`,

              role:
                "SERVICE_ADVISOR",
            });

        assert.equal(
          employeeResponse.status,
          201,
        );

        const employee =
          employeeResponse.body.data;

        const response =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/membership-invitations`,
            )
            .send({
              employeeId:
                employee.id,

              email:
                `different-${suffix}@motodesk.local`,

              role:
                MembershipRole.SERVICE_ADVISOR,
            });

        assert.equal(
          response.status,
          400,
        );

        assert.equal(
          response.body.success,
          false,
        );

        assert.equal(
          response.body.code,
          "EMPLOYEE_INVITATION_EMAIL_MISMATCH",
        );

        const invitationCount =
          await prisma.membershipInvitation.count({
            where: {
              organizationId,

              employeeId:
                employee.id,
            },
          });

        assert.equal(
          invitationCount,
          0,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects an employee invitation when the employee is already linked to a membership",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const {
          user,
        } =
          await createRegisteredUser();

        const membership =
          await prisma.membership.create({
            data: {
              organizationId,

              userId:
                user.id,

              role:
                MembershipRole.TECHNICIAN,

              status:
                MembershipStatus.ACTIVE,
            },
          });

        const employeeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/employees`,
            )
            .send({
              firstName:
                user.firstName,

              lastName:
                user.lastName,

              email:
                user.email,

              role:
                "TECHNICIAN",

              membershipId:
                membership.id,
            });

        assert.equal(
          employeeResponse.status,
          201,
        );

        const employee =
          employeeResponse.body.data;

        assert.equal(
          employee.membershipId,
          membership.id,
        );

        const response =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/membership-invitations`,
            )
            .send({
              employeeId:
                employee.id,

              email:
                user.email,

              role:
                MembershipRole.TECHNICIAN,
            });

        assert.equal(
          response.status,
          409,
        );

        assert.equal(
          response.body.success,
          false,
        );

        assert.equal(
          response.body.code,
          "EMPLOYEE_MEMBERSHIP_ALREADY_LINKED",
        );
      },
    );
  },
);

//************************************************************** */