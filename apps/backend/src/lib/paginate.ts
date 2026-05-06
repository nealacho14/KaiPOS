import type { Collection, CollationOptions, Document, Filter, FindOptions, Sort } from 'mongodb';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginateOptions<T extends Document> {
  collection: Collection<T>;
  filter: Filter<T>;
  page: number;
  limit: number;
  sort?: Sort;
  projection?: FindOptions<T>['projection'];
  // Pass when the caller's filter relies on a collated index (e.g.
  // case-insensitive prefix search). Both the find AND the countDocuments
  // need the same collation, otherwise Mongo can't use the index.
  collation?: CollationOptions;
}

// `data` and `total` are queried in parallel. `countDocuments` is O(n) over
// the matched set (no covering-index optimization), so for very large
// collections this doubles per-page latency. Acceptable today; revisit with
// cursor-based pagination if collections like `orders` grow.
export async function paginate<T extends Document>(
  opts: PaginateOptions<T>,
): Promise<PaginatedResult<T>> {
  const { collection, filter, page, limit, sort, projection, collation } = opts;
  const skip = (page - 1) * limit;

  const findCursor = collection.find(filter, { projection });
  if (collation) findCursor.collation(collation);
  const countOpts = collation ? { collation } : undefined;

  const [data, total] = await Promise.all([
    findCursor
      .sort(sort ?? {})
      .skip(skip)
      .limit(limit)
      .toArray(),
    collection.countDocuments(filter, countOpts),
  ]);

  return {
    data: data as T[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export function toPaginatedResponse<T>(result: PaginatedResult<T>) {
  return {
    success: true as const,
    data: result.data,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
}
