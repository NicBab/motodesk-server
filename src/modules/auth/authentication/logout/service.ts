import { SessionRevocationReason } from "../../../../generated/prisma/client.js";

import { parseRefreshToken } from "../../tokens/refresh-token.service.js";

import { revokeSession } from "../../sessions/session.service.js";

import { prisma } from "../../../../config/prisma.js";

//************************************************************** */

export type LogoutResult = {
  sessionId: string;
  userId: string;
};

//************************************************************** */

export async function logoutUser(refreshToken: string): Promise<LogoutResult> {
  const parsedRefreshToken = parseRefreshToken(refreshToken);

  //************************************************************** */
  // Resolve the session before revocation so the logout audit event
  // can be attributed to the user without requiring a valid access
  // token on the logout route.

  const session = await prisma.session.findUnique({
    where: {
      id: parsedRefreshToken.sessionId,
    },

    select: {
      id: true,

      userId: true,
    },
  });

  await revokeSession(
    parsedRefreshToken.sessionId,
    SessionRevocationReason.LOGOUT,
  );

  //************************************************************** */

  if (!session) {
    return {
      sessionId: parsedRefreshToken.sessionId,

      userId: "",
    };
  }

  return {
    sessionId: session.id,

    userId: session.userId,
  };
}

//************************************************************** */
