import { z } from "zod";

import { createOrganizationSchema } from "../../../organizations/organization.contracts.js";

import {
  emailSchema,
  nameSchema,
  optionalPhoneSchema,
  passwordSchema,
} from "../../shared/validation/index.js";

//************************************************************** */

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: optionalPhoneSchema,

  organization: createOrganizationSchema.optional(),
});

//************************************************************** */

export type RegisterInput = z.infer<typeof registerSchema>;
