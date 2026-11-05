
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { prisma } from "../../../src/config/prisma.js";
import { MembershipRole } from "../../../src/generated/prisma/client.js";
import { hashToken } from "../../../src/modules/auth/tokens/token.crypto.js";
import { hashPassword } from "../../../src/modules/auth/security/password.service.js";
import { getPermissionsForRole } from "../../../src/modules/permissions/permission.utils.js";
import { acceptMembershipInvitationRecord } from "../../../src/modules/membership-invitations/membership-invitation.repository.js";
import { createAuthenticatedAgent } from "../helpers/billing-authenticated-agent.js";

//************************************************************** */

// Reproduces the dangerous ordering deterministically:
// 1. Acceptance reads the original token.
// 2. Invitation refresh commits a new token.
// 3. Acceptance enters its transaction with the old hash.
//
// No sleeps or timing-dependent concurrency assumptions.

describe("Membership invitation token refresh/acceptance race", () => {
  it("rejects a stale pre-refresh token at the transaction boundary", async () => {
    const { agent, organizationId } =
      await createAuthenticatedAgent();

    const email = `invite-race-${randomUUID()}@example.com`;

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword("MotoDeskInvite123!"),
        firstName: "Invite",
        lastName: "Race",
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });

    try {
      const created = await agent
        .post(
          `/api/v1/organizations/${organizationId}/membership-invitations`,
        )
        .send({
          email,
          role: MembershipRole.TECHNICIAN,
        });

      assert.equal(
        created.status,
        201,
        JSON.stringify(created.body),
      );

      const invitationId: string =
        created.body.data.invitation.id;

      const originalToken: string =
        created.body.data.token;

      const originalHash = hashToken(originalToken);

      // Simulate the acceptance service's lookup
      // before its acceptance transaction begins.

      const staleSnapshot =
        await prisma.membershipInvitation.findUniqueOrThrow({
          where: {
            tokenHash: originalHash,
          },
        });

      assert.equal(
        staleSnapshot.id,
        invitationId,
      );

      // Refresh commits before the stale acceptance
      // attempts to acquire the transaction lock.

      const refreshed = await agent.post(
        `/api/v1/organizations/${organizationId}/membership-invitations/${invitationId}/refresh`,
      );

      assert.equal(
        refreshed.status,
        200,
        JSON.stringify(refreshed.body),
      );

      assert.notEqual(
        hashToken(refreshed.body.data.token),
        originalHash,
      );

      // The repository must reject the stale token
      // inside its acceptance transaction.

      await assert.rejects(
        () =>
          acceptMembershipInvitationRecord(
            staleSnapshot.id,
            originalHash,
            staleSnapshot.organizationId,
            user.id,
            staleSnapshot.role,
            getPermissionsForRole(staleSnapshot.role),
            staleSnapshot.invitedByMembershipId,
            staleSnapshot.employeeId,
          ),
        (error: unknown) => {
          assert.equal(
            (error as { code?: string }).code,
            "MEMBERSHIP_INVITATION_TOKEN_INVALIDATED",
          );

          return true;
        },
      );

      // Verify the rejected acceptance did not
      // create a membership or consume the invitation.

      const after =
        await prisma.membershipInvitation.findUniqueOrThrow({
          where: {
            id: invitationId,
          },
        });

      assert.equal(after.acceptedAt, null);

      assert.equal(
        after.tokenHash,
        hashToken(refreshed.body.data.token),
      );

      assert.equal(
        await prisma.membership.count({
          where: {
            organizationId,
            userId: user.id,
          },
        }),
        0,
      );
    } finally {
      await prisma.auditLog.deleteMany({
        where: {
          actorUserId: user.id,
        },
      });

      await prisma.user.delete({
        where: {
          id: user.id,
        },
      });
    }
  });
});

//************************************************************** */
