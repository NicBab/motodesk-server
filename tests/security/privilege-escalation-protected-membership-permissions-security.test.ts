import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import request from "supertest";

import { app } from "../../src/app.js";
import { prisma } from "../../src/config/prisma.js";

import {
  MembershipRole,
  MembershipStatus,
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

const PASSWORD =
  "MotoDesk-Protected-Permissions-2026!";

//************************************************************** */

async function createVerifiedMember(
  organizationId: string,
  role: MembershipRole,
) {
  const suffix =
    randomUUID();

  const email =
    `protected-permission-${suffix}@motodesk.local`;

  const passwordHash =
    await hashPassword(
      PASSWORD,
    );

  const user =
    await prisma.user.create({
      data: {
        email,

        passwordHash,

        firstName:
          "Protected",

        lastName:
          "Permissions",

        isActive:
          true,

        emailVerifiedAt:
          new Date(),
      },
    });

  const membership =
    await prisma.membership.create({
      data: {
        userId:
          user.id,

        organizationId,

        role,

        status:
          MembershipStatus.ACTIVE,
      },
    });

  return {
    user,
    membership,
    email,
  };
}

//************************************************************** */

async function authenticateMember(
  email: string,
  organizationId: string,
) {
  const agent =
    request.agent(
      app,
    );

  const loginResponse =
    await agent
      .post(
        "/api/v1/auth/login",
      )
      .send({
        email,

        password:
          PASSWORD,
      });

  assert.equal(
    loginResponse.status,
    200,
  );

  const switchResponse =
    await agent
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

  return agent;
}

//************************************************************** */

describe(
  "Protected membership permission privilege escalation security",
  () => {
    it(
      "prevents an admin from modifying another admin's explicit permissions",
      async () => {
        const {
          organizationId,
          membershipId:
            ownerMembershipId,
        } =
          await createAuthenticatedAgent();

        //************************************************************** */
        // Create two verified ADMIN members in the same tenant.

        const actingAdmin =
          await createVerifiedMember(
            organizationId,
            MembershipRole.ADMIN,
          );

        const targetAdmin =
          await createVerifiedMember(
            organizationId,
            MembershipRole.ADMIN,
          );

        //************************************************************** */
        // Give the acting admin the permission required to reach the
        // permission-management boundary.
        //
        // This makes the hierarchy rule—not simple lack of permission—
        // the control under test.

        await prisma.membershipPermission.create({
          data: {
            organizationId,

            membershipId:
              actingAdmin.membership.id,

            permission:
              Permissions.MEMBERSHIPS_UPDATE,

            grantedByMembershipId:
              ownerMembershipId,
          },
        });

        const actingAdminAgent =
          await authenticateMember(
            actingAdmin.email,
            organizationId,
          );

        //************************************************************** */
        // ATTACK:
        //
        // ADMIN attempts to replace another ADMIN's explicit permission
        // set.

        const response =
          await actingAdminAgent
            .put(
              `/api/v1/organizations/${organizationId}/memberships/${targetAdmin.membership.id}/permissions`,
            )
            .send({
              permissions: [
                Permissions.MEMBERSHIPS_UPDATE,
              ],
            });

        assert.equal(
          response.status,
          403,
          "An ADMIN must not be able to modify another ADMIN's explicit permissions.",
        );

        //************************************************************** */
        // Rejected escalation must not persist anything.

        const targetPermissions =
          await prisma.membershipPermission.findMany({
            where: {
              organizationId,

              membershipId:
                targetAdmin.membership.id,
            },
          });

        assert.equal(
          targetPermissions.length,
          0,
        );
      },
    );

    //************************************************************** */

    it(
      "prevents an admin from modifying owner permission overrides",
      async () => {
        const {
          organizationId,
          membershipId:
            ownerMembershipId,
        } =
          await createAuthenticatedAgent();

        const actingAdmin =
          await createVerifiedMember(
            organizationId,
            MembershipRole.ADMIN,
          );

        await prisma.membershipPermission.create({
          data: {
            organizationId,

            membershipId:
              actingAdmin.membership.id,

            permission:
              Permissions.MEMBERSHIPS_UPDATE,

            grantedByMembershipId:
              ownerMembershipId,
          },
        });

        const actingAdminAgent =
          await authenticateMember(
            actingAdmin.email,
            organizationId,
          );

        //************************************************************** */

        const response =
          await actingAdminAgent
            .put(
              `/api/v1/organizations/${organizationId}/memberships/${ownerMembershipId}/permissions`,
            )
            .send({
              permissions: [
                Permissions.MEMBERSHIPS_VIEW,
              ],
            });

        assert.equal(
          response.status,
          403,
          "An ADMIN must not be able to modify OWNER permission overrides.",
        );

        //************************************************************** */
        // OWNER permissions remain implicit and must not be replaced by
        // stored override records.

        const ownerPermissionRecords =
          await prisma.membershipPermission.findMany({
            where: {
              organizationId,

              membershipId:
                ownerMembershipId,
            },
          });

        assert.equal(
          ownerPermissionRecords.length,
          0,
        );
      },
    );
  },
);

//************************************************************** */