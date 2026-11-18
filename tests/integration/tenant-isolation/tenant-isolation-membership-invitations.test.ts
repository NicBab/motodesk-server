
import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";

import { describe, it, after } from "node:test";

import { MembershipRole } from "../../../src/generated/prisma/client.js";

import { prisma } from "../../../src/config/prisma.js";

import { createAuthenticatedAgent } from "../helpers/billing-authenticated-agent.js";

import { createTrialSubscriptionFixture } from "../helpers/subscription.fixture.js";

//************************************************************** */

const secondaryOrganizationIds: string[] = [];

//************************************************************** */

async function switchOrganization(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
) {
  const response = await agent
    .post("/api/v1/auth/switch-organization")
    .send({
      organizationId,
    });

  assert.equal(
    response.status,
    200,
    JSON.stringify(response.body),
  );

  assert.equal(response.body.success, true);

  const cookies = response.headers["set-cookie"];

  const cookieLines = Array.isArray(cookies)
    ? cookies
    : typeof cookies === "string"
      ? [cookies]
      : [];

  const accessCookie = cookieLines.find(
    (cookie: string) =>
      cookie.startsWith("motodesk_access_token="),
  );

  assert.ok(
    accessCookie,
    "Expected organization-scoped access cookie.",
  );

  agent.set(
    "Cookie",
    accessCookie.split(";")[0]!,
  );
}

//************************************************************** */

async function createEmployee(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  suffix: string,
  label: string,
) {
  const response = await agent
    .post(
      `/api/v1/organizations/${organizationId}/employees`,
    )
    .send({
      firstName: label,

      lastName:
        `Invitation-Employee-${suffix}`,

      email:
        `tenant-invite-employee-${label.toLowerCase()}-${suffix}@motodesk.local`,

      role: "TECHNICIAN",

      hourlyRate: 30,

      laborRate: 125,
    });

  assert.equal(
    response.status,
    201,
    JSON.stringify(response.body),
  );

  return response.body.data;
}

//************************************************************** */

async function createInvitation(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  organizationId: string,
  email: string,
  employeeId?: string,
) {
  const response = await agent
    .post(
      `/api/v1/organizations/${organizationId}/membership-invitations`,
    )
    .send({
      email,

      role:
        MembershipRole.TECHNICIAN,

      ...(employeeId
        ? {
            employeeId,
          }
        : {}),
    });

  assert.equal(
    response.status,
    201,
    JSON.stringify(response.body),
  );

  assert.equal(response.body.success, true);

  return response.body.data;
}

//************************************************************** */

describe(
  "Membership Invitation tenant isolation integration",
  () => {
    it(
      "prevents cross-organization invitation visibility, refresh, revoke, and employee linkage",
      async () => {
        const {
          agent,

          organizationId:
            organizationAId,
        } =
          await createAuthenticatedAgent();

        const suffix =
          randomUUID();

        //************************************************************** */
        // ORGANIZATION B

        const organizationBResponse =
          await agent
            .post(
              "/api/v1/organizations",
            )
            .send({
              name:
                `Invitation Tenant B ${suffix}`,

              slug:
                `invitation-tenant-b-${suffix}`,
            });

        assert.equal(
          organizationBResponse.status,
          201,
          JSON.stringify(organizationBResponse.body),
        );

        const organizationBId =
          organizationBResponse.body.data.id;

        secondaryOrganizationIds.push(
          organizationBId,
        );

        //************************************************************** */
        // ESTABLISH SUBSCRIPTION ACCESS

        await createTrialSubscriptionFixture(
          organizationBId,
        );

        //************************************************************** */
        // ORGANIZATION B EMPLOYEE + INVITATION

        await switchOrganization(
          agent,
          organizationBId,
        );

        const employeeB =
          await createEmployee(
            agent,
            organizationBId,
            suffix,
            "B",
          );

        const invitationBEmail =
          `tenant-invite-b-${suffix}@motodesk.local`;

        const invitationBResult =
          await createInvitation(
            agent,
            organizationBId,
            invitationBEmail,
          );

        const invitationB =
          invitationBResult.invitation;

        //************************************************************** */
        // ORGANIZATION A EMPLOYEE + INVITATION

        await switchOrganization(
          agent,
          organizationAId,
        );

        const employeeA =
          await createEmployee(
            agent,
            organizationAId,
            suffix,
            "A",
          );

        const invitationAEmail =
          `tenant-invite-a-${suffix}@motodesk.local`;

        const invitationAResult =
          await createInvitation(
            agent,
            organizationAId,
            invitationAEmail,
          );

        const invitationA =
          invitationAResult.invitation;

        //************************************************************** */
        // BASELINE B INVITATION

        const initialInvitationB =
          await prisma.membershipInvitation.findUniqueOrThrow({
            where: {
              id:
                invitationB.id,
            },
          });

        assert.equal(
          initialInvitationB.organizationId,
          organizationBId,
        );

        assert.equal(
          initialInvitationB.revokedAt,
          null,
        );

        assert.equal(
          initialInvitationB.acceptedAt,
          null,
        );

        //************************************************************** */
        // LIST ISOLATION

        const listResponse =
          await agent.get(
            `/api/v1/organizations/${organizationAId}/membership-invitations?page=1&pageSize=100`,
          );

        assert.equal(
          listResponse.status,
          200,
        );

        assert.equal(
          listResponse.body.success,
          true,
        );

        const invitations =
          listResponse.body.data.items;

        assert.ok(
          Array.isArray(
            invitations,
          ),
        );

        //************************************************************** */
        // A's invitation is visible.

        assert.equal(
          invitations.some(
            (
              invitation: {
                id: string;
              },
            ) =>
              invitation.id ===
              invitationA.id,
          ),
          true,
        );

        //************************************************************** */
        // B's invitation is not visible.

        assert.equal(
          invitations.some(
            (
              invitation: {
                id: string;
              },
            ) =>
              invitation.id ===
              invitationB.id,
          ),
          false,
        );

        //************************************************************** */
        // No returned invitation may belong to B.

        for (
          const invitation
          of invitations
        ) {
          assert.equal(
            invitation.organizationId,
            organizationAId,
          );
        }

        //************************************************************** */
        // Serialized response must not leak B's invitation identity,
        // email, organization, or token.

        const listJson =
          JSON.stringify(
            listResponse.body,
          );

        assert.equal(
          listJson.includes(
            invitationB.id,
          ),
          false,
        );

        assert.equal(
          listJson.includes(
            invitationBEmail,
          ),
          false,
        );

        assert.equal(
          listJson.includes(
            organizationBId,
          ),
          false,
        );

        assert.equal(
          listJson.includes(
            invitationBResult.token,
          ),
          false,
        );

        //************************************************************** */
        // FOREIGN INVITATION — REFRESH

        const foreignRefreshResponse =
          await agent.post(
            `/api/v1/organizations/${organizationAId}/membership-invitations/${invitationB.id}/refresh`,
          );

        assert.equal(
          foreignRefreshResponse.status,
          404,
        );

        assert.equal(
          foreignRefreshResponse.body.code,
          "MEMBERSHIP_INVITATION_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN INVITATION — REVOKE

        const foreignRevokeResponse =
          await agent.delete(
            `/api/v1/organizations/${organizationAId}/membership-invitations/${invitationB.id}`,
          );

        assert.equal(
          foreignRevokeResponse.status,
          404,
        );

        assert.equal(
          foreignRevokeResponse.body.code,
          "MEMBERSHIP_INVITATION_NOT_FOUND",
        );

        //************************************************************** */
        // FOREIGN EMPLOYEE LINKAGE

        const foreignEmployeeEmail =
          `tenant-invite-foreign-employee-${suffix}@motodesk.local`;

        const foreignEmployeeResponse =
          await agent
            .post(
              `/api/v1/organizations/${organizationAId}/membership-invitations`,
            )
            .send({
              email:
                foreignEmployeeEmail,

              role:
                MembershipRole.TECHNICIAN,

              employeeId:
                employeeB.id,
            });

        assert.equal(
          foreignEmployeeResponse.status,
          404,
        );

        assert.equal(
          foreignEmployeeResponse.body.code,
          "MEMBERSHIP_INVITATION_EMPLOYEE_NOT_FOUND",
        );

        //************************************************************** */
        // LOCAL EMPLOYEE LINKAGE STILL WORKS

        const localEmployeeInvitation =
          await createInvitation(
            agent,
            organizationAId,
            employeeA.email,
            employeeA.id,
          );

        const storedLocalEmployeeInvitation =
          await prisma.membershipInvitation.findUniqueOrThrow({
            where: {
              id:
                localEmployeeInvitation.invitation.id,
            },
          });

        assert.equal(
          storedLocalEmployeeInvitation.organizationId,
          organizationAId,
        );

        assert.equal(
          storedLocalEmployeeInvitation.employeeId,
          employeeA.id,
        );

        //************************************************************** */
        // B INVITATION MUST BE COMPLETELY UNCHANGED

        const storedInvitationB =
          await prisma.membershipInvitation.findUniqueOrThrow({
            where: {
              id:
                invitationB.id,
            },
          });

        assert.equal(
          storedInvitationB.organizationId,
          organizationBId,
        );

        assert.equal(
          storedInvitationB.email,
          initialInvitationB.email,
        );

        assert.equal(
          storedInvitationB.role,
          initialInvitationB.role,
        );

        assert.equal(
          storedInvitationB.tokenHash,
          initialInvitationB.tokenHash,
        );

        assert.equal(
          storedInvitationB.expiresAt.getTime(),
          initialInvitationB.expiresAt.getTime(),
        );

        assert.equal(
          storedInvitationB.acceptedAt,
          initialInvitationB.acceptedAt,
        );

        assert.equal(
          storedInvitationB.revokedAt,
          initialInvitationB.revokedAt,
        );

        assert.equal(
          storedInvitationB.employeeId,
          initialInvitationB.employeeId,
        );

        //************************************************************** */
        // REJECTED FOREIGN EMPLOYEE ATTACK MUST NOT CREATE AN INVITATION

        const crossTenantEmployeeInvitation =
          await prisma.membershipInvitation.findFirst({
            where: {
              organizationId:
                organizationAId,

              employeeId:
                employeeB.id,
            },
          });

        assert.equal(
          crossTenantEmployeeInvitation,
          null,
        );

        //************************************************************** */
        // Rejected attack email must not exist in A.

        const rejectedInvitation =
          await prisma.membershipInvitation.findFirst({
            where: {
              organizationId:
                organizationAId,

              email:
                foreignEmployeeEmail,
            },
          });

        assert.equal(
          rejectedInvitation,
          null,
        );
      },
    );
  },
);

//************************************************************** */
// CLEANUP — SECONDARY ORGANIZATIONS

after(async () => {
  if (secondaryOrganizationIds.length === 0) {
    return;
  }

  await prisma.auditLog.deleteMany({
    where: {
      organizationId: {
        in: secondaryOrganizationIds,
      },
    },
  });

  await prisma.organization.deleteMany({
    where: {
      id: {
        in: secondaryOrganizationIds,
      },
    },
  });

  secondaryOrganizationIds.length = 0;
});

//************************************************************** */
