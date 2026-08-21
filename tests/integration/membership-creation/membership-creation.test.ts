import assert from "node:assert/strict";

import {
  describe,
  it,
} from "node:test";

import {
  MembershipRole,
} from "../../../src/generated/prisma/client.js";

import {
  prisma,
} from "../../../src/config/prisma.js";

import {
  getPermissionsForRole,
} from "../../../src/modules/permissions/permission.utils.js";

import {
  createAuthenticatedAgent,
} from "../helpers/authenticated-agent.js";

//************************************************************** */

async function createRegisteredUser() {
  const suffix =
    `${Date.now()}-${Math.random()}`;

  return prisma.user.create({
    data: {
      email:
        `membership-create-${suffix}@motodesk.test`,

      passwordHash:
        "integration-test-not-used",

      firstName:
        "Membership",

      lastName:
        "Create",

      isActive:
        true,
    },
  });
}

//************************************************************** */

describe(
  "Membership creation integration",
  () => {
    it(
      "creates a membership for an existing user and provisions role permissions",
      async () => {
        const {
          agent,
          organizationId,
          membershipId:
            ownerMembershipId,
        } =
          await createAuthenticatedAgent();

        const user =
          await createRegisteredUser();

        const response =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/memberships`,
            )
            .send({
              email:
                user.email,

              role:
                MembershipRole.TECHNICIAN,
            });

        assert.equal(
          response.status,
          201,
        );

        assert.equal(
          response.body.success,
          true,
        );

        assert.equal(
          response.body.data.user.id,
          user.id,
        );

        assert.equal(
          response.body.data.role,
          MembershipRole.TECHNICIAN,
        );

        const membership =
          await prisma.membership.findFirst({
            where: {
              organizationId,
              userId:
                user.id,
            },
          });

        assert.ok(
          membership,
        );

        assert.equal(
          membership.role,
          MembershipRole.TECHNICIAN,
        );

        const storedPermissions =
          await prisma.membershipPermission.findMany({
            where: {
              organizationId,
              membershipId:
                membership.id,
            },

            orderBy: {
              permission: "asc",
            },
          });

        const actualPermissions =
          storedPermissions.map(
            (permission) =>
              permission.permission,
          );

        const expectedPermissions =
          getPermissionsForRole(
            MembershipRole.TECHNICIAN,
          );

        assert.deepEqual(
          [...actualPermissions].sort(),
          [...expectedPermissions].sort(),
        );

        assert.equal(
          storedPermissions.every(
            (permission) =>
              permission.grantedByMembershipId ===
              ownerMembershipId,
          ),
          true,
        );
      },
    );

    //************************************************************** */

    it(
      "rejects membership creation when the user does not exist",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const response =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/memberships`,
            )
            .send({
              email:
                `missing-${Date.now()}@motodesk.test`,

              role:
                MembershipRole.TECHNICIAN,
            });

        assert.equal(
          response.status,
          404,
        );

        assert.equal(
          response.body.code,
          "USER_NOT_FOUND",
        );
      },
    );

    //************************************************************** */

    it(
      "rejects duplicate organization membership",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const user =
          await createRegisteredUser();

        const firstResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/memberships`,
            )
            .send({
              email:
                user.email,

              role:
                MembershipRole.PARTS,
            });

        assert.equal(
          firstResponse.status,
          201,
        );

        const secondResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/memberships`,
            )
            .send({
              email:
                user.email,

              role:
                MembershipRole.PARTS,
            });

        assert.equal(
          secondResponse.status,
          409,
        );

        assert.equal(
          secondResponse.body.code,
          "MEMBERSHIP_ALREADY_EXISTS",
        );
      },
    );

    //************************************************************** */

    it(
      "rejects assigning the owner role through membership creation",
      async () => {
        const {
          agent,
          organizationId,
        } =
          await createAuthenticatedAgent();

        const user =
          await createRegisteredUser();

        const response =
          await agent
            .post(
              `/api/v1/organizations/${organizationId}/memberships`,
            )
            .send({
              email:
                user.email,

              role:
                MembershipRole.OWNER,
            });

        assert.equal(
          response.status,
          403,
        );

        assert.equal(
          response.body.code,
          "OWNER_ASSIGNMENT_FORBIDDEN",
        );

        const membership =
          await prisma.membership.findFirst({
            where: {
              organizationId,
              userId:
                user.id,
            },
          });

        assert.equal(
          membership,
          null,
        );
      },
    );
  },
);

//************************************************************** */