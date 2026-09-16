import {
  ExternalAuthProvider,
} from "../../../generated/prisma/client.js";

//************************************************************** */

export interface ExternalIdentity {
  provider: ExternalAuthProvider;

  providerAccountId: string;

  email: string;

  emailVerified: boolean;

  firstName: string | null;

  lastName: string | null;
}

//************************************************************** */

export interface ExternalAuthorizationState {
  state: string;

  expiresAt: Date;
}

//************************************************************** */

export interface ExternalAuthorizationCallback {
  code: string;

  state: string;
}

//************************************************************** */

export interface ExternalAuthenticationResult {
  provider: ExternalAuthProvider;

  providerAccountId: string;

  email: string;

  emailVerified: boolean;

  firstName: string | null;

  lastName: string | null;
}

//************************************************************** */