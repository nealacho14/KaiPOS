import { MongoServerError, type Filter } from 'mongodb';
import type { Product, TokenPayload } from '@kaipos/shared/types';
import { SUPER_ADMIN_BUSINESS_ID } from '@kaipos/shared/permissions';
import { getProductsCollection } from '../db/collections.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from '../schemas/products.js';

const log = createLogger({ module: 'products-service' });

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildScopeFilter(actor: TokenPayload, query?: ListProductsQuery): Filter<Product> {
  if (actor.role === 'super_admin') {
    return query?.businessId ? { businessId: query.businessId } : {};
  }
  return { businessId: actor.businessId };
}

function resolveTargetBusinessId(actor: TokenPayload, requested: string | undefined): string {
  if (actor.role === 'super_admin') {
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

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

export async function listProducts(
  actor: TokenPayload,
  query: ListProductsQuery = {},
): Promise<Product[]> {
  const products = await getProductsCollection();
  const filter: Filter<Product> = { ...buildScopeFilter(actor, query) };

  if (query.includeInactive !== 'true') {
    filter.isActive = true;
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (query.q) {
    const pattern = escapeRegex(query.q);
    filter.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { sku: { $regex: pattern, $options: 'i' } },
    ];
  }

  return products.find(filter).toArray();
}

export async function getProductById(actor: TokenPayload, id: string): Promise<Product> {
  const products = await getProductsCollection();
  const filter: Filter<Product> = { _id: id, ...buildScopeFilter(actor) };
  const product = await products.findOne(filter);
  if (!product) {
    throw new NotFoundError('Product');
  }
  return product;
}

export async function createProduct(
  actor: TokenPayload,
  data: CreateProductInput,
  _context: { route: string; method: string },
): Promise<Product> {
  const targetBusinessId = resolveTargetBusinessId(actor, data.businessId);
  const products = await getProductsCollection();

  const existing = await products.findOne({ businessId: targetBusinessId, sku: data.sku });
  if (existing) {
    throw new AppError('A product with this SKU already exists', 409, 'DUPLICATE_SKU');
  }

  const now = new Date();
  const newProduct: Product = {
    _id: crypto.randomUUID(),
    businessId: targetBusinessId,
    name: data.name,
    description: data.description,
    price: data.price,
    category: data.category,
    sku: data.sku,
    stock: data.stock,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.userId,
    ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
  };

  try {
    await products.insertOne(newProduct);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError('A product with this SKU already exists', 409, 'DUPLICATE_SKU');
    }
    throw err;
  }

  log.info(
    { productId: newProduct._id, sku: newProduct.sku, businessId: targetBusinessId },
    'Product created',
  );

  return newProduct;
}

export async function updateProduct(
  actor: TokenPayload,
  id: string,
  patch: UpdateProductInput,
  _context: { route: string; method: string },
): Promise<Product> {
  const products = await getProductsCollection();
  const filter: Filter<Product> = { _id: id, ...buildScopeFilter(actor) };

  const existing = await products.findOne(filter);
  if (!existing) {
    throw new NotFoundError('Product');
  }

  if (patch.sku !== undefined && patch.sku !== existing.sku) {
    const conflict = await products.findOne({
      businessId: existing.businessId,
      sku: patch.sku,
      _id: { $ne: existing._id },
    });
    if (conflict) {
      throw new AppError('A product with this SKU already exists', 409, 'DUPLICATE_SKU');
    }
  }

  const update: Partial<Product> = { updatedAt: new Date() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.sku !== undefined) update.sku = patch.sku;
  if (patch.stock !== undefined) update.stock = patch.stock;
  if (patch.imageUrl !== undefined) update.imageUrl = patch.imageUrl;
  if (patch.isActive !== undefined) update.isActive = patch.isActive;

  try {
    await products.updateOne({ _id: existing._id }, { $set: update });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError('A product with this SKU already exists', 409, 'DUPLICATE_SKU');
    }
    throw err;
  }

  const updated = await products.findOne({ _id: existing._id });
  if (!updated) {
    throw new NotFoundError('Product');
  }

  log.info({ productId: updated._id, businessId: updated.businessId }, 'Product updated');

  return updated;
}

export async function softDeleteProduct(
  actor: TokenPayload,
  id: string,
  _context: { route: string; method: string },
): Promise<Product> {
  const products = await getProductsCollection();
  const filter: Filter<Product> = { _id: id, ...buildScopeFilter(actor) };

  const existing = await products.findOne(filter);
  if (!existing) {
    throw new NotFoundError('Product');
  }

  if (existing.isActive) {
    await products.updateOne(
      { _id: existing._id },
      { $set: { isActive: false, updatedAt: new Date() } },
    );
  }

  const updated = await products.findOne({ _id: existing._id });
  if (!updated) {
    throw new NotFoundError('Product');
  }

  log.info({ productId: updated._id, businessId: updated.businessId }, 'Product deactivated');

  return updated;
}
