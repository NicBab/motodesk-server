import { z } from "zod";

import {
  paginationQuerySchema,
} from "../../platform/http/pagination.schema.js";

//************************************************************** */

export const listAuditLogsQuerySchema =
  paginationQuerySchema.extend({
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
  });

//************************************************************** */

export type ListAuditLogsQueryInput =
  z.infer<
    typeof listAuditLogsQuerySchema
  >;

//************************************************************** */