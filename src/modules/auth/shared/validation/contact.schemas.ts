import { z } from "zod";

//************************************************************** */

export const emailSchema = z
  .string()
  .trim()
  .email(
    "Enter a valid email address.",
  )
  .max(
    254,
    "Email address cannot exceed 254 characters.",
  )
  .transform((email) =>
    email.toLowerCase(),
  );

//************************************************************** */

export const optionalPhoneSchema =
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }

      const trimmedValue =
        value.trim();

      return trimmedValue === ""
        ? undefined
        : trimmedValue;
    },
    z
      .string()
      .min(
        7,
        "Phone number must contain at least 7 characters.",
      )
      .max(
        30,
        "Phone number cannot exceed 30 characters.",
      )
      .optional(),
  );