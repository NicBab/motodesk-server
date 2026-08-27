import { z } from "zod";

//************************************************************** */

export const listPartOrderDemandQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(150)
    .optional(),
});

//************************************************************** */

export type ListPartOrderDemandQueryInput =
  z.infer<
    typeof listPartOrderDemandQuerySchema
  >;

//************************************************************** */