import { z } from "zod";

import {
  paginationQuerySchema,
} from "../../platform/http/pagination.schema.js";

//************************************************************** */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

const searchSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .optional();

//************************************************************** */

function defaultRangeEnd(): string {
  const tomorrow = new Date();

  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  return tomorrow.toISOString().slice(0, 10);
}

function defaultRangeStart(before: string): string {
  const start = new Date(`${before}T00:00:00.000Z`);

  start.setUTCDate(start.getUTCDate() - 30);

  return start.toISOString().slice(0, 10);
}

//************************************************************** */

// Dates are UTC calendar boundaries:
// from is inclusive; before is exclusive.
// With no dates supplied, use 30 calendar days including today.
export const platformDateRangeQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    before: z.iso.date().optional(),
  })
  .transform((query) => {
    const before = query.before ?? defaultRangeEnd();

    return {
      from: query.from ?? defaultRangeStart(before),
      before,
    };
  })
  .superRefine((query, context) => {
    const fromTimestamp = Date.parse(
      `${query.from}T00:00:00.000Z`,
    );

    const beforeTimestamp = Date.parse(
      `${query.before}T00:00:00.000Z`,
    );

    if (fromTimestamp >= beforeTimestamp) {
      context.addIssue({
        code: "custom",
        path: ["before"],
        message: "The range end must be after the start.",
      });

      return;
    }

    if (
      beforeTimestamp - fromTimestamp >
      MAX_RANGE_DAYS * DAY_MS
    ) {
      context.addIssue({
        code: "custom",
        path: ["before"],
        message: `The date range cannot exceed ${MAX_RANGE_DAYS} days.`,
      });
    }

    const latestEndTimestamp = Date.parse(
      `${defaultRangeEnd()}T00:00:00.000Z`,
    );

    if (beforeTimestamp > latestEndTimestamp) {
      context.addIssue({
        code: "custom",
        path: ["before"],
        message: "The range cannot include future calendar days.",
      });
    }
  });

//************************************************************** */

export const platformOverviewQuerySchema =
  platformDateRangeQuerySchema;

export const platformGrowthQuerySchema =
  platformDateRangeQuerySchema;

//************************************************************** */

export const platformOrganizationsQuerySchema =
  paginationQuerySchema.extend({
    search: searchSchema,

    status: z
      .enum(["ACTIVE", "ARCHIVED"])
      .optional(),
  });

//************************************************************** */

export const platformUsersQuerySchema =
  paginationQuerySchema.extend({
    search: searchSchema,

    // Parse explicitly: Boolean("false") would incorrectly be true.
    isActive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  });

//************************************************************** */

export const platformMembershipsQuerySchema =
  paginationQuerySchema;

//************************************************************** */

export type PlatformDateRangeQueryInput = z.infer<
  typeof platformDateRangeQuerySchema
>;

export type PlatformOverviewQueryInput = z.infer<
  typeof platformOverviewQuerySchema
>;

export type PlatformGrowthQueryInput = z.infer<
  typeof platformGrowthQuerySchema
>;

export type PlatformOrganizationsQueryInput = z.infer<
  typeof platformOrganizationsQuerySchema
>;

export type PlatformUsersQueryInput = z.infer<
  typeof platformUsersQuerySchema
>;

export type PlatformMembershipsQueryInput = z.infer<
  typeof platformMembershipsQuerySchema
>;

//************************************************************** */