// export const updateProfileSchema = z
//   .object({
//     firstName: nameSchema.optional(),
//     lastName: nameSchema.optional(),
//     phone: optionalPhoneSchema,
//   })
//   .refine(
//     (input) =>
//       input.firstName !== undefined ||
//       input.lastName !== undefined ||
//       input.phone !== undefined,
//     {
//       message: "At least one profile field must be provided.",
//     },
//   );



// export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
