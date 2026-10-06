import { env } from "./env.js";

//************************************************************** */

// Keep CORS and browser mutation checks on the same allowlist.
// Marketing is not added because it was not previously authorized
// to make authenticated API requests.
const allowedBrowserOrigins = new Set<string>([
  new URL(env.CLIENT_URL).origin,

  ...(env.ADMIN_URL !== undefined
    ? [env.ADMIN_URL]
    : []),
]);

//************************************************************** */

export function isAllowedBrowserOrigin(
  origin: string,
): boolean {
  return allowedBrowserOrigins.has(origin);
}

//************************************************************** */