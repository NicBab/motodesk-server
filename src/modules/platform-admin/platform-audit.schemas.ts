import { z } from "zod";

import {
  paginationQuerySchema,
} from "../../platform/http/pagination.schema.js";

//************************************************************** */

const optionalFilter = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .optional();

//************************************************************** */

export const platformAuditQuerySchema = paginationQuerySchema
  .extend({
    search: optionalFilter,

    action: optionalFilter,
    resourceType: optionalFilter,
    resourceId: optionalFilter,
    actorUserId: optionalFilter,

    organizationId: optionalFilter,

    // ALL: every recorded audit event.
    // ORGANIZATION: events linked to an organization.
    // UNASSIGNED: events without an organization association,
    // including CLI bootstrap events and some authentication events.
    scope: z
      .enum(["ALL", "ORGANIZATION", "UNASSIGNED"])
      .default("ALL"),

    createdFrom: z
      .iso
      .datetime({ offset: true })
      .optional(),

    createdBefore: z
      .iso
      .datetime({ offset: true })
      .optional(),
  })
  .superRefine((query, context) => {
    if (
      query.createdFrom !== undefined &&
      query.createdBefore !== undefined &&
      Date.parse(query.createdFrom) >=
        Date.parse(query.createdBefore)
    ) {
      context.addIssue({
        code: "custom",
        path: ["createdBefore"],
        message: "The range end must be after the start.",
      });
    }

    if (
      query.scope === "UNASSIGNED" &&
      query.organizationId !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["organizationId"],
        message:
          "An organization filter cannot be combined with unassigned events.",
      });
    }
  });

//************************************************************** */

export type PlatformAuditQueryInput = z.infer<
  typeof platformAuditQuerySchema
>;

//************************************************************** */