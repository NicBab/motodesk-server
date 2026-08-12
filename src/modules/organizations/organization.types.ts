import type { MembershipRole } from "../../generated/prisma/client.js";

//************************************************************** */

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  ownerUserId: string;
  phone?: string;
  email?: string;
}

//************************************************************** */

export interface UpdateOrganizationInput {
  name?: string;
  phone?: string;
  email?: string;
}

//************************************************************** */
