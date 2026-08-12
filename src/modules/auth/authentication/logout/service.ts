import { SessionRevocationReason } from "../../../../generated/prisma/client.js";

import type { LogoutInput } from "./schema.js";

import { parseRefreshToken } from "../../tokens/refresh-token.service.js";

import {
  revokeSession,
} from "../../sessions/session.service.js";

//************************************************************** */

export async function logoutUser(input: LogoutInput): Promise<void> {
  const parsedRefreshToken = parseRefreshToken(input.refreshToken);

  await revokeSession(
    parsedRefreshToken.sessionId,
    SessionRevocationReason.LOGOUT,
  );
}

//************************************************************** */
