import { z } from "zod";

import {
  paginationQuerySchema,
} from "../../platform/http/pagination.schema.js";

//************************************************************** */

export const listAuditLogsQuerySchema = paginationQuerySchema
  .extend({
    search: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional(),

    action: z
      .string()
      .trim()
      .min(1)
      .optional(),

    resourceType: z
      .string()
      .trim()
      .min(1)
      .optional(),

    resourceId: z
      .string()
      .trim()
      .min(1)
      .optional(),

    actorUserId: z
      .string()
      .trim()
      .min(1)
      .optional(),

    // Inclusive start; requires an explicit timezone.
    createdFrom: z
      .iso
      .datetime({ offset: true })
      .optional(),

    // Exclusive end; lets the client include an entire selected day.
    createdBefore: z
      .iso
      .datetime({ offset: true })
      .optional(),
  })
  .superRefine((query, context) => {
    if (
      query.createdFrom !== undefined &&
      query.createdBefore !== undefined &&
      Date.parse(query.createdFrom) >= Date.parse(query.createdBefore)
    ) {
      context.addIssue({
        code: "custom",
        path: ["createdBefore"],
        message: "The end of the date range must be after the start.",
      });
    }
  });

//************************************************************** */

export type ListAuditLogsQueryInput = z.infer<
  typeof listAuditLogsQuerySchema
>;

//************************************************************** */




// import { z } from "zod";

// import {
//   paginationQuerySchema,
// } from "../../platform/http/pagination.schema.js";

// //************************************************************** */

// export const listAuditLogsQuerySchema =
//   paginationQuerySchema.extend({
//     action: z
//       .string()
//       .trim()
//       .min(1)
//       .optional(),

//     resourceType: z
//       .string()
//       .trim()
//       .min(1)
//       .optional(),

//     resourceId: z
//       .string()
//       .trim()
//       .min(1)
//       .optional(),

//     actorUserId: z
//       .string()
//       .trim()
//       .min(1)
//       .optional(),
//   });

// //************************************************************** */

// export type ListAuditLogsQueryInput =
//   z.infer<
//     typeof listAuditLogsQuerySchema
//   >;

// //************************************************************** */