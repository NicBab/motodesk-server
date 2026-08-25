import { SessionRevocationReason } from "../../../../generated/prisma/client.js";

import { parseRefreshToken } from "../../tokens/refresh-token.service.js";

import {
  revokeSession,
} from "../../sessions/session.service.js";

//************************************************************** */

export async function logoutUser(
  refreshToken: string,
): Promise<void> {
  const parsedRefreshToken = parseRefreshToken(refreshToken);

  await revokeSession(
    parsedRefreshToken.sessionId,
    SessionRevocationReason.LOGOUT,
  );
}

//************************************************************** */