import type { ClientSession, Filter } from 'mongodb';
import type { Category, TokenPayload } from '@kaipos/shared';
import { SUPER_ADMIN_BUSINESS_ID } from '@kaipos/shared';
import { getClient } from '../db/client.js';
import { getCategoriesCollection, getProductsCollection } from '../db/collections.js';
import { paginate, type PaginatedResult } from '../lib/paginate.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from '../schemas/categories.js';

const log = createLogger({ module: 'categories-service' });

function resolveTargetBusinessId(actor: TokenPayload, requested: string | undefined): string {
  if (actor.businessId === SUPER_ADMIN_BUSINESS_ID) {
    if (!requested) {
      throw new AppError(
        'super_admin must specify a target businessId',
        400,
        'MISSING_TARGET_BUSINESS_ID',
      );
    }
    if (requested === SUPER_ADMIN_BUSINESS_ID) {
      throw new AppError('Invalid target businessId', 400, 'INVALID_TARGET_BUSINESS_ID');
    }
    return requested;
  }
  return actor.businessId;
}

function buildScopeFilter(
  actor: TokenPayload,
  query: Partial<ListCategoriesQuery> = {},
): Filter<Category> {
  const filter: Filter<Category> = {};

  if (actor.businessId === SUPER_ADMIN_BUSINESS_ID) {
    if (query.businessId) filter.businessId = query.businessId;
  } else {
    filter.businessId = actor.businessId;
  }

  if (!query.includeInactive) {
    filter.isActive = true;
  }

  return filter;
}

export async function listCategories(
  actor: TokenPayload,
  query: Partial<ListCategoriesQuery> = {},
): Promise<PaginatedResult<Category>> {
  const categories = await getCategoriesCollection();
  return paginate({
    collection: categories,
    filter: buildScopeFilter(actor, query),
    page: query.page ?? 1,
    limit: query.limit ?? 50,
    sort: { sortOrder: 1, name: 1 },
  });
}

export async function createCategory(
  actor: TokenPayload,
  data: CreateCategoryInput,
): Promise<Category> {
  const businessId = resolveTargetBusinessId(actor, data.businessId);
  const categories = await getCategoriesCollection();

  const existing = await categories.findOne({ businessId, name: data.name });
  if (existing) {
    throw new AppError('A category with this name already exists', 409, 'DUPLICATE_CATEGORY_NAME', [
      { field: 'name', message: 'Category name already exists in this business' },
    ]);
  }

  const now = new Date();
  const category: Category = {
    _id: crypto.randomUUID(),
    businessId,
    name: data.name,
    ...(data.description !== undefined ? { description: data.description } : {}),
    sortOrder: data.sortOrder ?? 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.userId,
  };

  await categories.insertOne(category);
  log.info({ categoryId: category._id, businessId, name: category.name }, 'Category created');
  return category;
}

// Standalone Mongo (the dev docker-compose) cannot start transactions and
// returns code 20 / 'IllegalOperation'. We treat that as "transactions not
// available" and degrade to sequential writes — Atlas (prod) returns true
// transactional semantics. Any other error propagates.
function isTransactionsUnsupported(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: number; codeName?: string; message?: string };
  if (e.code === 20) return true;
  if (e.codeName === 'IllegalOperation') return true;
  return typeof e.message === 'string' && e.message.includes('Transaction numbers');
}

export async function updateCategory(
  actor: TokenPayload,
  id: string,
  patch: UpdateCategoryInput,
): Promise<Category> {
  const categories = await getCategoriesCollection();
  const products = await getProductsCollection();

  const filter: Filter<Category> = { _id: id };
  if (actor.businessId !== SUPER_ADMIN_BUSINESS_ID) {
    filter.businessId = actor.businessId;
  }

  const existing = await categories.findOne(filter);
  if (!existing) {
    throw new NotFoundError('Category');
  }

  const trimmedName = patch.name?.trim();
  const renaming = trimmedName !== undefined && trimmedName !== existing.name;

  if (renaming) {
    const conflict = await categories.findOne({
      businessId: existing.businessId,
      name: trimmedName,
      _id: { $ne: existing._id },
    });
    if (conflict) {
      throw new AppError(
        'A category with this name already exists',
        409,
        'DUPLICATE_CATEGORY_NAME',
        [{ field: 'name', message: 'Category name already exists in this business' }],
      );
    }
  }

  const now = new Date();
  const update: Partial<Category> = { updatedAt: now };
  if (trimmedName !== undefined) update.name = trimmedName;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.sortOrder !== undefined) update.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) update.isActive = patch.isActive;

  // Rename + cascade must be atomic to avoid a window where a product
  // references a category name that no longer exists. Atlas supports
  // transactions; standalone dev Mongo does not — fall back to sequential
  // writes there. The window in dev is narrow and acceptable.
  let cascadedCount = 0;
  const doWrites = async (session?: ClientSession) => {
    await categories.updateOne({ _id: existing._id }, { $set: update }, session ? { session } : {});
    if (renaming) {
      const result = await products.updateMany(
        { businessId: existing.businessId, category: existing.name },
        { $set: { category: trimmedName, updatedAt: now } },
        session ? { session } : {},
      );
      cascadedCount = result.modifiedCount;
    }
  };

  const client = await getClient();
  const session = client.startSession();
  try {
    await session.withTransaction(() => doWrites(session));
  } catch (err) {
    if (!isTransactionsUnsupported(err)) throw err;
    await doWrites();
  } finally {
    await session.endSession();
  }

  if (cascadedCount > 0) {
    log.info(
      {
        categoryId: existing._id,
        oldName: existing.name,
        newName: trimmedName,
        updated: cascadedCount,
      },
      'Cascaded category rename to products',
    );
  }

  const updated = await categories.findOne({ _id: existing._id });
  if (!updated) throw new NotFoundError('Category');
  return updated;
}

export async function deactivateCategory(actor: TokenPayload, id: string): Promise<Category> {
  return updateCategory(actor, id, { isActive: false });
}
