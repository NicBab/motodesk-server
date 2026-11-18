
import assert from "node:assert/strict";

import {
  randomUUID,
} from "node:crypto";

import {
  describe,
  it,
} from "node:test";

import request from "supertest";

import {
  app,
} from "../../src/app.js";

import {
  prisma,
} from "../../src/config/prisma.js";

import {
  MembershipRole,
} from "../../src/generated/prisma/client.js";

import {
  hashPassword,
} from "../../src/modules/auth/security/password.service.js";

import {
  Permissions,
} from "../../src/modules/permissions/permission.constants.js";

import {
  createAuthenticatedAgent,
} from "../integration/helpers/billing-authenticated-agent.js";

//************************************************************** */

describe(
  "Membership permission privilege-escalation security",
  () => {
    it(
      "prevents a technician from granting privileged permissions to itself",
      async () => {
        const suffix =
          randomUUID();

        const technicianEmail =
          `privilege-tech-${suffix}@motodesk.test`;

        const password =
          "MotoDesk-Privilege-Security-2026!";

        //************************************************************** */
        // Create an isolated organization with an active trial.
        //
        // Do not consume seats in the shared development organization.

        const {
          agent: ownerAgent,
          organizationId,
        } = await createAuthenticatedAgent();

        //************************************************************** */

        const passwordHash =
          await hashPassword(password);

        const technicianUser =
          await prisma.user.create({
            data: {
              email: technicianEmail,
              passwordHash,
              firstName: "Privilege",
              lastName: "Technician",
              emailVerifiedAt: new Date(),
              isActive: true,
            },
          });

        try {
          //************************************************************** */
          // Provision the technician through the actual HTTP endpoint.

          const membershipResponse =
            await ownerAgent
              .post(
                `/api/v1/organizations/${organizationId}/memberships`,
              )
              .send({
                email: technicianEmail,
                role: MembershipRole.TECHNICIAN,
              });

          assert.equal(
            membershipResponse.status,
            201,
            JSON.stringify(membershipResponse.body),
          );

          assert.equal(
            membershipResponse.body?.success,
            true,
          );

          const technicianMembershipId =
            membershipResponse.body?.data?.id;

          assert.equal(
            typeof technicianMembershipId,
            "string",
          );

          if (
            typeof technicianMembershipId !== "string"
          ) {
            throw new Error(
              "Membership creation did not return the technician membership identifier.",
            );
          }

          //************************************************************** */
          // Authenticate as the lower-privileged technician.

          const technicianAgent =
            request.agent(app);

          const loginResponse =
            await technicianAgent
              .post("/api/v1/auth/login")
              .send({
                email: technicianEmail,
                password,
              });

          assert.equal(
            loginResponse.status,
            200,
            JSON.stringify(loginResponse.body),
          );

          //************************************************************** */

          const switchResponse =
            await technicianAgent
              .post(
                "/api/v1/auth/switch-organization",
              )
              .send({
                organizationId,
              });

          assert.equal(
            switchResponse.status,
            200,
            JSON.stringify(switchResponse.body),
          );

          //************************************************************** */
          // Verify the technician does not already possess the
          // privileged membership-management permission.

          const permissionsBefore =
            await prisma.membershipPermission.findMany({
              where: {
                organizationId,
                membershipId: technicianMembershipId,
              },

              select: {
                permission: true,
              },
            });

          assert.equal(
            permissionsBefore.some(
              (record) =>
                record.permission ===
                Permissions.MEMBERSHIPS_UPDATE,
            ),
            false,
            "Technician unexpectedly already possesses memberships:update.",
          );

          //************************************************************** */
          // ATTACK:
          // Attempt to grant administrative permissions to itself.

          const escalationResponse =
            await technicianAgent
              .put(
                `/api/v1/organizations/${organizationId}/memberships/${technicianMembershipId}/permissions`,
              )
              .send({
                permissions: [
                  Permissions.MEMBERSHIPS_UPDATE,
                ],
              });

          assert.equal(
            escalationResponse.status,
            403,
            "A technician must not be able to modify its own permission overrides.",
          );

          //************************************************************** */
          // Verify the rejected privilege was not persisted.

          const permissionsAfter =
            await prisma.membershipPermission.findMany({
              where: {
                organizationId,
                membershipId: technicianMembershipId,
              },

              select: {
                permission: true,
              },
            });

          assert.equal(
            permissionsAfter.some(
              (record) =>
                record.permission ===
                Permissions.MEMBERSHIPS_UPDATE,
            ),
            false,
            "The rejected privilege escalation persisted memberships:update.",
          );

          //************************************************************** */
          // Defense in depth:
          // Attempt to promote the technician to MANAGER.

          const protectedOperation =
            await technicianAgent
              .patch(
                `/api/v1/organizations/${organizationId}/memberships/${technicianMembershipId}`,
              )
              .send({
                role: MembershipRole.MANAGER,
              });

          assert.equal(
            protectedOperation.status,
            403,
          );

          //************************************************************** */
          // Verify the stored membership remains unchanged.

          const storedMembership =
            await prisma.membership.findUnique({
              where: {
                id: technicianMembershipId,
              },

              select: {
                userId: true,
                role: true,
              },
            });

          assert.ok(
            storedMembership,
          );

          assert.equal(
            storedMembership.userId,
            technicianUser.id,
          );

          assert.equal(
            storedMembership.role,
            MembershipRole.TECHNICIAN,
          );
        } finally {
          //************************************************************** */
          // Remove all records belonging to this temporary technician.
          //
          // The isolated billing helper independently cleans up the
          // temporary organization and owner.

          await prisma.$transaction(async (transaction) => {
            await transaction.auditLog.deleteMany({
              where: {
                actorUserId: technicianUser.id,
              },
            });

            await transaction.user.delete({
              where: {
                id: technicianUser.id,
              },
            });
          });
        }
      },
    );
  },
);

//************************************************************** */
