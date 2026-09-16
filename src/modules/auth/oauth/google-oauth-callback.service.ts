import {
  ExternalAuthProvider,
} from "../../../generated/prisma/client.js";

import type {
  AuthenticationResult,
  RequestMetadata,
} from "../auth.types.js";

import {
  authenticateExternalIdentity,
} from "./oauth.service.js";

import {
  exchangeGoogleAuthorizationCode,
} from "./providers/google.provider.js";

import type {
  GoogleOAuthState,
} from "./oauth-state.service.js";

//************************************************************** */

export async function completeGoogleOAuth(
  callbackUrl: URL,
  oauthState: GoogleOAuthState,
  context: RequestMetadata,
): Promise<AuthenticationResult> {
  const googleIdentity =
    await exchangeGoogleAuthorizationCode(
      callbackUrl,
      oauthState.state,
      oauthState.nonce,
      oauthState.codeVerifier,
    );

  return authenticateExternalIdentity(
    {
      provider:
        ExternalAuthProvider.GOOGLE,

      providerAccountId:
        googleIdentity.providerAccountId,

      email:
        googleIdentity.email,

      emailVerified:
        googleIdentity.emailVerified,

      firstName:
        googleIdentity.firstName ?? "",

      lastName:
        googleIdentity.lastName ?? "",
    },
    context,
  );
}

//************************************************************** */