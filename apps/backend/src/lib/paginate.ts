import type { Collection, Document, Filter, Sort, FindOptions } from 'mongodb';

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
}

export async function paginate<T extends Document>(
  opts: PaginateOptions<T>,
): Promise<PaginatedResult<T>> {
  const { collection, filter, page, limit, sort, projection } = opts;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    collection
      .find(filter, { projection })
      .sort(sort ?? {})
      .skip(skip)
      .limit(limit)
      .toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    data: data as T[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
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
