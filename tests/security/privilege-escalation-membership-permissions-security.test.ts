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
} from "../integration/helpers/authenticated-agent.js";

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
        // Use the established seeded OWNER fixture. This is the same
        // organization/owner setup used by the existing membership
        // integration suite.

        const {
          agent:
            ownerAgent,

          organizationId,
        } =
          await createAuthenticatedAgent();

        //************************************************************** */
        // Membership creation requires an existing MotoDesk user.
        //
        // Create the technician user first, exactly as the existing
        // membership-creation integration tests do.

        const passwordHash =
          await hashPassword(
            password,
          );

        const technicianUser =
          await prisma.user.create({
            data: {
              email:
                technicianEmail,

              passwordHash,

              firstName:
                "Privilege",

              lastName:
                "Technician",

              isActive:
                true,
            },
          });

        //************************************************************** */
        // The OWNER now provisions the technician membership through the
        // real HTTP endpoint.

        const membershipResponse =
          await ownerAgent
            .post(
              `/api/v1/organizations/${organizationId}/memberships`,
            )
            .send({
              email:
                technicianEmail,

              role:
                MembershipRole.TECHNICIAN,
            });

        assert.equal(
          membershipResponse.status,
          201,
        );

        assert.equal(
          membershipResponse.body
            ?.success,
          true,
        );

        const technicianMembershipId =
          membershipResponse.body
            ?.data
            ?.id;

        assert.equal(
          typeof technicianMembershipId,
          "string",
        );

        if (
          typeof technicianMembershipId !==
          "string"
        ) {
          throw new Error(
            "Membership creation did not return the technician membership identifier.",
          );
        }

        //************************************************************** */
        // Authenticate as the newly-created lower-privileged user.

        const technicianAgent =
          request.agent(
            app,
          );

        const loginResponse =
          await technicianAgent
            .post(
              "/api/v1/auth/login",
            )
            .send({
              email:
                technicianEmail,

              password,
            });

        assert.equal(
          loginResponse.status,
          200,
        );

        //************************************************************** */
        // Switch the technician's authentication context into the same
        // organization.

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
        );

        //************************************************************** */
        // Verify the technician does not already possess the privileged
        // membership-management permission we're about to attack.

        const permissionsBefore =
          await prisma.membershipPermission.findMany({
            where: {
              organizationId,

              membershipId:
                technicianMembershipId,
            },

            select: {
              permission:
                true,
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
        //
        // A technician attempts to replace its own permission set with
        // one containing an administrative membership-management
        // capability.

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
        // The rejected request must not persist the requested privilege.

        const permissionsAfter =
          await prisma.membershipPermission.findMany({
            where: {
              organizationId,

              membershipId:
                technicianMembershipId,
            },

            select: {
              permission:
                true,
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
        //
        // The technician must still be unable to exercise the protected
        // membership-update endpoint.

        const protectedOperation =
          await technicianAgent
            .patch(
              `/api/v1/organizations/${organizationId}/memberships/${technicianMembershipId}`,
            )
            .send({
              role:
                MembershipRole.MANAGER,
            });

        assert.equal(
          protectedOperation.status,
          403,
        );

        //************************************************************** */
        // Sanity check: the account itself remains intact and the role
        // was not modified by either attack.

        const storedMembership =
          await prisma.membership.findUnique({
            where: {
              id:
                technicianMembershipId,
            },

            select: {
              userId:
                true,

              role:
                true,
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
      },
    );
  },
);

//************************************************************** */