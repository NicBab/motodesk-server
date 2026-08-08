import { z } from "zod";

//************************************************************** */

export const nameSchema = z
  .string()
  .trim()
  .min(
    1,
    "Name is required.",
  )
  .max(
    100,
    "Name cannot exceed 100 characters.",
  );