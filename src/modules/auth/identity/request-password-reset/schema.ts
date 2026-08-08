import { z } from "zod";

import {
  emailSchema,
} from "../../shared/validation/index.js";

//************************************************************** */

export const requestPasswordResetSchema =
  z.object({
    email: emailSchema,
  });

//************************************************************** */

export type RequestPasswordResetInput =
  z.infer<
    typeof requestPasswordResetSchema
  >;