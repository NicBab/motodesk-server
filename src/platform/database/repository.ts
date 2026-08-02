import type { Prisma } from "../../generated/prisma/client.js";

import { prisma } from "../../config/prisma.js";

import { AppError } from "../errors/app-error.js";

//************************************************************** */

export type DatabaseTransaction =
  Omit<
    Prisma.TransactionClient,
    "$connect" |
    "$disconnect" |
    "$on" |
    "$transaction" |
    "$use" |
    "$extends"
  >;

//************************************************************** */

export async function runTransaction<T>(
  callback: (
    transaction: DatabaseTransaction,
  ) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (transaction) =>
      callback(transaction),
  );
}

//************************************************************** */

export function buildPagination(
  page: number,
  pageSize: number,
) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

//************************************************************** */

export function buildOrderBy<
  T extends string,
>(
  field: T,
  direction:
    | "asc"
    | "desc" = "asc",
) {
  return {
    [field]: direction,
  } as Record<
    T,
    "asc" | "desc"
  >;
}

//************************************************************** */

export function assertFound<T>(
  value: T | null | undefined,
  message = "Record not found.",
  code = "RESOURCE_NOT_FOUND",
): asserts value is T {
  if (value == null) {
    throw new AppError(
      404,
      message,
      {
        code,
      },
    );
  }
}