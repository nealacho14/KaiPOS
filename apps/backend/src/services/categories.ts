import type { Filter } from 'mongodb';
import type { Category, TokenPayload } from '@kaipos/shared';
import { SUPER_ADMIN_BUSINESS_ID } from '@kaipos/shared';
import { getCategoriesCollection } from '../db/collections.js';
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
): Promise<Category[]> {
  const categories = await getCategoriesCollection();
  return categories.find(buildScopeFilter(actor, query)).sort({ sortOrder: 1, name: 1 }).toArray();
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

export async function updateCategory(
  actor: TokenPayload,
  id: string,
  patch: UpdateCategoryInput,
): Promise<Category> {
  const categories = await getCategoriesCollection();

  const filter: Filter<Category> = { _id: id };
  if (actor.businessId !== SUPER_ADMIN_BUSINESS_ID) {
    filter.businessId = actor.businessId;
  }

  const existing = await categories.findOne(filter);
  if (!existing) {
    throw new NotFoundError('Category');
  }

  if (patch.name !== undefined && patch.name !== existing.name) {
    const conflict = await categories.findOne({
      businessId: existing.businessId,
      name: patch.name,
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

  const update: Partial<Category> = { updatedAt: new Date() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.sortOrder !== undefined) update.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) update.isActive = patch.isActive;

  await categories.updateOne({ _id: existing._id }, { $set: update });

  const updated = await categories.findOne({ _id: existing._id });
  if (!updated) throw new NotFoundError('Category');
  return updated;
}

export async function deactivateCategory(actor: TokenPayload, id: string): Promise<Category> {
  return updateCategory(actor, id, { isActive: false });
}
