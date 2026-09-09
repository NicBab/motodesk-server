import { z } from "zod";

import {
  nameSchema,
  optionalPhoneSchema,
} from "../../shared/validation/index.js";

//************************************************************** */

const optionalJobTitleSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();

    return trimmedValue === ""
      ? undefined
      : trimmedValue;
  },
  z
    .string()
    .max(
      150,
      "Job title cannot exceed 150 characters.",
    )
    .optional(),
);

//************************************************************** */

const preferredTimezoneSchema = z
  .string()
  .trim()
  .min(
    1,
    "Preferred timezone is required.",
  )
  .max(
    100,
    "Preferred timezone cannot exceed 100 characters.",
  );

//************************************************************** */

export const displayModeSchema = z.enum([
  "LIGHT",
  "DARK",
  "SYSTEM",
]);

//************************************************************** */

export const updateProfileSchema = z
  .object({
    firstName: nameSchema.optional(),

    lastName: nameSchema.optional(),

    phone: optionalPhoneSchema,

    jobTitle: optionalJobTitleSchema,

    preferredTimezone:
      preferredTimezoneSchema.optional(),

    displayMode:
      displayModeSchema.optional(),
  })
  .refine(
    (input) =>
      input.firstName !== undefined ||
      input.lastName !== undefined ||
      input.phone !== undefined ||
      input.jobTitle !== undefined ||
      input.preferredTimezone !== undefined ||
      input.displayMode !== undefined,
    {
      message:
        "At least one profile field must be provided.",
    },
  );

//************************************************************** */

export type UpdateProfileInput =
  z.infer<typeof updateProfileSchema>;