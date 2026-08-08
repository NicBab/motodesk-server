import { z } from "zod";

import {
  emailSchema,
} from "../../shared/validation/index.js";

//************************************************************** */

export const resendEmailVerificationSchema =
  z.object({
    email: emailSchema,
  });

//************************************************************** */

export type ResendEmailVerificationInput =
  z.infer<
    typeof resendEmailVerificationSchema
  >;