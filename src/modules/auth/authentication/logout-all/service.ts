import {
  SessionRevocationReason,
} from "../../../../generated/prisma/client.js";

import {
  revokeUserSessions,
} from "../../sessions/session.service.js";

//************************************************************** */


export async function logoutAllUserSessions(userId: string): Promise<number> {
  const result = await revokeUserSessions(
    userId,
    SessionRevocationReason.LOGOUT_ALL,
  );

  return result.revokedSessionCount;
}

//************************************************************** */