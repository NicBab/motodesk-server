import { z } from "zod";

//************************************************************** */

export const passwordSchema = z
  .string()
  .min(
    12,
    "Password must contain at least 12 characters.",
  )
  .max(
    128,
    "Password cannot exceed 128 characters.",
  )
  .regex(
    /[a-z]/,
    "Password must contain at least one lowercase letter.",
  )
  .regex(
    /[A-Z]/,
    "Password must contain at least one uppercase letter.",
  )
  .regex(
    /\d/,
    "Password must contain at least one number.",
  )
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character.",
  );