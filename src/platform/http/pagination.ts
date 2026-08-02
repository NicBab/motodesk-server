export interface PaginationInput {
  page: number;
  pageSize: number;
}

//************************************************************** */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

//************************************************************** */

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}

//************************************************************** */

export function createPaginationMeta(
  input: PaginationInput,
  totalItems: number,
): PaginationMeta {
  const totalPages = Math.max(
    1,
    Math.ceil(totalItems / input.pageSize),
  );

  return {
    page: input.page,
    pageSize: input.pageSize,
    totalItems,
    totalPages,
    hasNextPage: input.page < totalPages,
    hasPreviousPage: input.page > 1,
  };
}

//************************************************************** */

export function createPaginatedData<T>(
  items: T[],
  input: PaginationInput,
  totalItems: number,
): PaginatedData<T> {
  return {
    items,
    pagination: createPaginationMeta(
      input,
      totalItems,
    ),
  };
}

//************************************************************** */

export function getPaginationOffset(
  input: PaginationInput,
): number {
  return (
    (input.page - 1) *
    input.pageSize
  );
}