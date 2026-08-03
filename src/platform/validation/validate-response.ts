import type { ZodError } from "zod";

//************************************************************** */

export interface ValidationErrorItem {
  field: string;
  message: string;
}

//************************************************************** */

export function mapValidationErrors(
  error: ZodError,
): ValidationErrorItem[] {
  return error.issues.map(
    (issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }),
  );
}