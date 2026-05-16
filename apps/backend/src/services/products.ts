import type { Filter } from 'mongodb';
import type { Product, ProductPreference, TokenPayload } from '@kaipos/shared/types';
import { channelFor } from '@kaipos/shared/types';
import { SUPER_ADMIN_BUSINESS_ID } from '@kaipos/shared/permissions';
import { PutObjectCommand, S3Client, type PutObjectCommandInput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  getBranchesCollection,
  getCategoriesCollection,
  getKitchenStationsCollection,
  getProductPreferencesCollection,
  getProductsCollection,
} from '../db/collections.js';
import { paginate, type PaginatedResult } from '../lib/paginate.js';
import { AppError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { publishToChannel } from '../lib/ws-publish.js';
import { isWithinAvailabilityWindow } from '../lib/availability.js';
import { canAccessBranch, assertBranchAccess } from '../middleware/branch-access.js';
import type {
  CreateProductInput,
  ListProductsQuery,
  ReorderProductsInput,
  UpdateProductInput,
  UploadUrlInput,
} from '../schemas/products.js';
import { logAuditEvent } from './audit.js';

const log = createLogger({ module: 'products-service' });

const UPLOAD_URL_EXPIRES_IN = 60;

const CONTENT_TYPE_TO_EXT: Record<UploadUrlInput['contentType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const DEFAULT_TIMEZONE = 'America/Santo_Domingo';
const TIMEZONE_CACHE_TTL_MS = 60_000;

interface CachedTimezone {
  value: string;
  expiresAt: number;
}

const branchTimezoneCache = new Map<string, CachedTimezone>();

/**
 * Resolves a branch's timezone with a short in-memory TTL cache. Used by
 * `listProducts` when `activeNow=true` filters a page of products against
 * the branch local clock — without the cache, every page hit would round-trip
 * to Mongo just to read the same field. Falls back to `America/Santo_Domingo`
 * when the branch is missing, matching the seed/backfill default.
 */
export async function getBranchTimezone(branchId: string): Promise<string> {
  const cached = branchTimezoneCache.get(branchId);
  const nowMs = Date.now();
  if (cached && cached.expiresAt > nowMs) {
    return cached.value;
  }

  const branches = await getBranchesCollection();
  const branch = await branches.findOne(
    { _id: branchId },
    { projection: { timezone: 1 } as const },
  );
  const timezone = branch?.timezone ?? DEFAULT_TIMEZONE;
  branchTimezoneCache.set(branchId, { value: timezone, expiresAt: nowMs + TIMEZONE_CACHE_TTL_MS });
  return timezone;
}

let s3ClientSingleton: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3ClientSingleton) {
    const endpoint = process.env.S3_ENDPOINT;
    s3ClientSingleton = new S3Client(endpoint ? { endpoint, forcePathStyle: true } : {});
  }
  return s3ClientSingleton;
}

function resolveBusinessIdForMutation(
  actor: TokenPayload,
  targetBusinessId: string | undefined,
): string {
  if (actor.businessId === SUPER_ADMIN_BUSINESS_ID) {
    if (!targetBusinessId) {
      throw new AppError(
        'super_admin must specify a target businessId',
        400,
        'MISSING_TARGET_BUSINESS_ID',
      );
    }
    if (targetBusinessId === SUPER_ADMIN_BUSINESS_ID) {
      throw new AppError('Invalid target businessId', 400, 'INVALID_TARGET_BUSINESS_ID');
    }
    return targetBusinessId;
  }
  return actor.businessId;
}

/**
 * Resolves the businessId to use for a mutation scoped to a specific branch.
 * For tenant-scoped roles the actor's own businessId always wins. For
 * super_admin we look the branch up so the operation targets the correct
 * business — `reorderProducts` has no businessId in its payload, so without
 * this helper a super_admin would hit MISSING_TARGET_BUSINESS_ID.
 */
async function resolveBusinessIdForBranchMutation(
  actor: TokenPayload,
  branchId: string,
): Promise<string> {
  if (actor.businessId !== SUPER_ADMIN_BUSINESS_ID) {
    return actor.businessId;
  }
  const branches = await getBranchesCollection();
  const branch = await branches.findOne({ _id: branchId }, { projection: { businessId: 1 } });
  if (!branch) {
    throw new NotFoundError('Branch');
  }
  return branch.businessId;
}

function buildListFilter(actor: TokenPayload, query: ListProductsQuery): Filter<Product> {
  const filter: Filter<Product> = { branchId: query.branchId };

  if (actor.businessId === SUPER_ADMIN_BUSINESS_ID) {
    if (query.businessId) {
      filter.businessId = query.businessId;
    }
  } else {
    filter.businessId = actor.businessId;
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (!query.includeInactive) {
    filter.isActive = true;
  }

  if (query.q) {
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Anchored prefix so the `{branchId, name}` index can be used (paired
    // with the collation in the find call). SKU and barcode share the same
    // prefix-only semantics — partial-suffix search isn't a use case we
    // support.
    filter.$or = [
      { name: { $regex: `^${escaped}` } },
      { sku: { $regex: `^${escaped}` } },
      { barcode: { $regex: `^${escaped}` } },
    ];
  }

  return filter;
}

function assertVariantsUniqueSkus(input: { variants?: { sku: string }[] }): void {
  if (!input.variants || input.variants.length === 0) return;
  const seen = new Set<string>();
  for (const variant of input.variants) {
    if (seen.has(variant.sku)) {
      throw new AppError(
        'Variant SKUs must be unique within a product',
        400,
        'VARIANT_SKU_DUPLICATE',
        [{ field: 'variants.sku', message: 'Duplicate variant SKU' }],
      );
    }
    seen.add(variant.sku);
  }
}

function assertModifierMaxSelectable(input: {
  modifierGroups?: { maxSelectable?: number; options: unknown[] }[];
}): void {
  if (!input.modifierGroups) return;
  for (const group of input.modifierGroups) {
    if (typeof group.maxSelectable === 'number' && group.maxSelectable > group.options.length) {
      throw new AppError(
        'maxSelectable cannot exceed the number of options',
        400,
        'MAX_SELECTABLE_EXCEEDS_OPTIONS',
        [
          {
            field: 'modifierGroups.maxSelectable',
            message: 'maxSelectable exceeds options.length',
          },
        ],
      );
    }
  }
}

async function assertKitchenStationIds(
  businessId: string,
  branchId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;

  const unique = Array.from(new Set(ids));
  const collection = await getKitchenStationsCollection();
  const found = await collection.find({ _id: { $in: unique }, businessId, branchId }).toArray();

  if (found.length !== unique.length) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', [
      {
        field: 'kitchenStationIds',
        message: 'One or more kitchenStationIds do not belong to this branch',
      },
    ]);
  }
}

function auditBranchMismatch(
  actor: TokenPayload,
  productId: string,
  branchId: string,
  context: { route: string; method: string },
): void {
  logAuditEvent({
    action: 'authorization_failed',
    target: productId,
    userId: actor.userId,
    businessId: actor.businessId,
    metadata: {
      permission: 'products:write',
      branchId,
      route: context.route,
      method: context.method,
    },
  });
}

export async function listProducts(
  actor: TokenPayload,
  query: ListProductsQuery,
): Promise<PaginatedResult<Product>> {
  const products = await getProductsCollection();
  let filter = buildListFilter(actor, query);

  // `featuredIn` joins manually against `productPreferences` so we can keep
  // the products query on its own indexes. The featured set per branch is
  // expected to be small (handful to dozens). If that ever grows past a few
  // hundred we should switch to an aggregation `$lookup`, but at that point
  // the UX for "featured" likely needs rethinking anyway.
  if (query.featuredIn) {
    const prefs = await getProductPreferencesCollection();
    const businessId =
      actor.businessId === SUPER_ADMIN_BUSINESS_ID
        ? (query.businessId ?? undefined)
        : actor.businessId;
    const prefFilter: Filter<ProductPreference> = {
      branchId: query.featuredIn,
      featured: true,
    };
    if (businessId) prefFilter.businessId = businessId;
    const featured = await prefs.find(prefFilter, { projection: { productId: 1 } }).toArray();
    const ids = featured.map((p) => p.productId);
    if (ids.length === 0) {
      return { data: [], total: 0, page: query.page, limit: query.limit, totalPages: 0 };
    }
    filter = { ...filter, _id: { $in: ids } };
  }

  const result = await paginate({
    collection: products,
    filter,
    page: query.page,
    limit: query.limit,
    projection: { modifierGroups: 0 },
    // When no search is active, lean on the {branchId, category, sortOrder}
    // index for a stable DB-level pagination order — `_id` is the final
    // tiebreaker so skip/limit can't skip or duplicate rows across pages.
    // The post-fetch step below re-sorts the current page by the category's
    // own sortOrder (which lives in a separate collection) without disturbing
    // pagination stability.
    sort: query.q ? { createdAt: -1 } : { category: 1, sortOrder: 1, _id: 1 },
    // Match the case-insensitive collation on the {branchId, name} index
    // when a prefix search is in play (see buildListFilter `q` branch).
    collation: query.q ? { locale: 'es', strength: 2 } : undefined,
  });

  let data = result.data;

  // Post-fetch ordering when no q: stable sort by name to provide a deterministic
  // baseline. Category sortOrder is enriched below with a single batch lookup.
  if (!query.q && data.length > 0) {
    const categoryNames = Array.from(new Set(data.map((p) => p.category)));
    const businessIds = Array.from(new Set(data.map((p) => p.businessId)));
    const categories = await getCategoriesCollection();
    const catDocs = await categories
      .find(
        {
          name: { $in: categoryNames },
          businessId: businessIds.length === 1 ? businessIds[0] : { $in: businessIds },
        },
        { projection: { name: 1, sortOrder: 1, businessId: 1 } },
      )
      .toArray();
    const catSort = new Map<string, number>();
    for (const c of catDocs) {
      catSort.set(`${c.businessId}::${c.name}`, c.sortOrder ?? 0);
    }
    data = [...data].sort((a, b) => {
      const aCat = catSort.get(`${a.businessId}::${a.category}`) ?? 0;
      const bCat = catSort.get(`${b.businessId}::${b.category}`) ?? 0;
      if (aCat !== bCat) return aCat - bCat;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name, 'es');
    });
  }

  // `activeNow` filter runs post-pagination — the total/totalPages reported
  // is the pre-filter count. UX-wise the caller should label this clearly
  // (e.g. "X of Y results match the current schedule").
  if (query.activeNow) {
    const timezone = await getBranchTimezone(query.branchId);
    const now = new Date();
    data = data.filter((p) => {
      if (!p.availabilityWindow) return true;
      return isWithinAvailabilityWindow(p.availabilityWindow, timezone, now);
    });
  }

  return { ...result, data };
}

export async function getProductById(actor: TokenPayload, id: string): Promise<Product> {
  const products = await getProductsCollection();
  const doc = await products.findOne({ _id: id });
  if (!doc) {
    throw new NotFoundError('Product');
  }

  if (actor.businessId !== SUPER_ADMIN_BUSINESS_ID && doc.businessId !== actor.businessId) {
    throw new NotFoundError('Product');
  }

  if (!canAccessBranch(actor, doc.branchId)) {
    throw new NotFoundError('Product');
  }

  return doc;
}

export async function createProduct(
  actor: TokenPayload,
  input: CreateProductInput,
): Promise<Product> {
  assertBranchAccess(actor, input.branchId);

  const businessId = resolveBusinessIdForMutation(actor, undefined);

  assertVariantsUniqueSkus(input);
  assertModifierMaxSelectable(input);

  await assertKitchenStationIds(businessId, input.branchId, input.kitchenStationIds);

  const products = await getProductsCollection();

  const existing = await products.findOne({ branchId: input.branchId, sku: input.sku });
  if (existing) {
    throw new AppError(
      'A product with this SKU already exists in this branch',
      409,
      'SKU_ALREADY_EXISTS',
      [{ field: 'sku', message: 'SKU already exists in this branch' }],
    );
  }

  const now = new Date();
  const product: Product = {
    _id: crypto.randomUUID(),
    businessId,
    branchId: input.branchId,
    name: input.name,
    description: input.description,
    price: input.price,
    category: input.category,
    sku: input.sku,
    stock: input.stock,
    ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
    ...(input.cost !== undefined ? { cost: input.cost } : {}),
    ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
    trackStock: input.trackStock,
    ...(input.lowStockThreshold !== undefined
      ? { lowStockThreshold: input.lowStockThreshold }
      : {}),
    stockUnit: input.stockUnit,
    availability: input.availability,
    serviceSchedules: input.serviceSchedules,
    allergens: input.allergens,
    dietaryTags: input.dietaryTags,
    modifierGroups: input.modifierGroups,
    kitchenStationIds: input.kitchenStationIds,
    ...(input.variants !== undefined ? { variants: input.variants } : {}),
    ...(input.availabilityWindow !== undefined
      ? { availabilityWindow: input.availabilityWindow }
      : {}),
    sortOrder: input.sortOrder,
    ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.userId,
  };

  try {
    await products.insertOne(product);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError(
        'A product with this SKU already exists in this branch',
        409,
        'SKU_ALREADY_EXISTS',
        [{ field: 'sku', message: 'SKU already exists in this branch' }],
      );
    }
    throw err;
  }

  logAuditEvent({
    action: 'product_created',
    target: product._id,
    userId: actor.userId,
    businessId,
    metadata: { branchId: product.branchId, sku: product.sku },
  });

  log.info(
    { productId: product._id, businessId, branchId: product.branchId, sku: product.sku },
    'Product created',
  );

  await fanOutProductEvent(product, 'product.created', { name: product.name });

  return product;
}

export async function updateProduct(
  actor: TokenPayload,
  id: string,
  patch: UpdateProductInput,
  context: { route: string; method: string },
): Promise<Product> {
  const products = await getProductsCollection();
  const existing = await products.findOne({ _id: id });
  if (!existing) {
    throw new NotFoundError('Product');
  }

  if (actor.businessId !== SUPER_ADMIN_BUSINESS_ID && existing.businessId !== actor.businessId) {
    auditBranchMismatch(actor, id, existing.branchId, context);
    throw new ForbiddenError('Access denied to this product');
  }

  if (!canAccessBranch(actor, existing.branchId)) {
    auditBranchMismatch(actor, id, existing.branchId, context);
    throw new ForbiddenError('Access denied to this branch');
  }

  assertVariantsUniqueSkus(patch);
  assertModifierMaxSelectable(patch);

  if (patch.kitchenStationIds !== undefined) {
    await assertKitchenStationIds(existing.businessId, existing.branchId, patch.kitchenStationIds);
  }

  if (patch.sku !== undefined && patch.sku !== existing.sku) {
    const conflict = await products.findOne({
      branchId: existing.branchId,
      sku: patch.sku,
      _id: { $ne: existing._id },
    });
    if (conflict) {
      throw new AppError(
        'A product with this SKU already exists in this branch',
        409,
        'SKU_ALREADY_EXISTS',
        [{ field: 'sku', message: 'SKU already exists in this branch' }],
      );
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
  if (patch.cost !== undefined) update.cost = patch.cost;
  if (patch.taxRate !== undefined) update.taxRate = patch.taxRate;
  if (patch.trackStock !== undefined) update.trackStock = patch.trackStock;
  if (patch.lowStockThreshold !== undefined) update.lowStockThreshold = patch.lowStockThreshold;
  if (patch.stockUnit !== undefined) update.stockUnit = patch.stockUnit;
  if (patch.availability !== undefined) update.availability = patch.availability;
  if (patch.serviceSchedules !== undefined) update.serviceSchedules = patch.serviceSchedules;
  if (patch.allergens !== undefined) update.allergens = patch.allergens;
  if (patch.dietaryTags !== undefined) update.dietaryTags = patch.dietaryTags;
  if (patch.modifierGroups !== undefined) update.modifierGroups = patch.modifierGroups;
  if (patch.kitchenStationIds !== undefined) update.kitchenStationIds = patch.kitchenStationIds;
  if (patch.variants !== undefined) update.variants = patch.variants;
  if (patch.availabilityWindow !== undefined) update.availabilityWindow = patch.availabilityWindow;
  if (patch.sortOrder !== undefined) update.sortOrder = patch.sortOrder;
  if (patch.barcode !== undefined) update.barcode = patch.barcode;
  if (patch.isActive !== undefined) update.isActive = patch.isActive;

  try {
    await products.updateOne({ _id: existing._id }, { $set: update });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError(
        'A product with this SKU already exists in this branch',
        409,
        'SKU_ALREADY_EXISTS',
        [{ field: 'sku', message: 'SKU already exists in this branch' }],
      );
    }
    throw err;
  }

  const updated = await products.findOne({ _id: existing._id });
  if (!updated) {
    throw new NotFoundError('Product');
  }

  logAuditEvent({
    action: 'product_updated',
    target: updated._id,
    userId: actor.userId,
    businessId: updated.businessId,
    metadata: { branchId: updated.branchId, sku: updated.sku },
  });

  await fanOutProductEvent(updated, 'product.updated', { name: updated.name });

  // Low-stock alert: emit only on the transition into "below threshold". This
  // avoids spamming clients on every save once a product is already low.
  const wasLow = isLowStock(existing);
  const isLow = isLowStock(updated);
  if (!wasLow && isLow) {
    await fanOutProductEvent(updated, 'product.low-stock', {
      name: updated.name,
      stock: updated.stock,
      lowStockThreshold: updated.lowStockThreshold,
    });
  }

  return updated;
}

export async function deleteProduct(
  actor: TokenPayload,
  id: string,
  context: { route: string; method: string },
): Promise<void> {
  const products = await getProductsCollection();
  const existing = await products.findOne({ _id: id });
  if (!existing) {
    throw new NotFoundError('Product');
  }

  if (actor.businessId !== SUPER_ADMIN_BUSINESS_ID && existing.businessId !== actor.businessId) {
    auditBranchMismatch(actor, id, existing.branchId, context);
    throw new ForbiddenError('Access denied to this product');
  }

  if (!canAccessBranch(actor, existing.branchId)) {
    auditBranchMismatch(actor, id, existing.branchId, context);
    throw new ForbiddenError('Access denied to this branch');
  }

  if (existing.isActive) {
    await products.updateOne(
      { _id: existing._id },
      { $set: { isActive: false, updatedAt: new Date() } },
    );
  }

  logAuditEvent({
    action: 'product_deleted',
    target: existing._id,
    userId: actor.userId,
    businessId: existing.businessId,
    metadata: { branchId: existing.branchId, sku: existing.sku },
  });

  await fanOutProductEvent(existing, 'product.deleted', { name: existing.name });
}

export async function reorderProducts(
  actor: TokenPayload,
  input: ReorderProductsInput,
): Promise<{ matched: number }> {
  assertBranchAccess(actor, input.branchId);
  const businessId = await resolveBusinessIdForBranchMutation(actor, input.branchId);
  const products = await getProductsCollection();

  const now = new Date();
  const ops = input.items.map((item) => ({
    updateOne: {
      filter: { _id: item.id, branchId: input.branchId, businessId },
      update: { $set: { sortOrder: item.sortOrder, updatedAt: now } },
    },
  }));

  // `ordered: false` so a missing id in the middle doesn't block subsequent
  // updates. Mongo standalone in Docker doesn't support multi-doc transactions
  // — partial failures here leave the visible sortOrder inconsistent until the
  // caller retries. The route layer treats matchedCount < items.length as an
  // explicit 400 to make that obvious.
  const result = await products.bulkWrite(ops, { ordered: false });
  const matched = result.matchedCount ?? 0;

  if (matched !== input.items.length) {
    const ids = input.items.map((it) => it.id);
    const found = await products
      .find({ _id: { $in: ids }, branchId: input.branchId, businessId }, { projection: { _id: 1 } })
      .toArray();
    const foundIds = new Set(found.map((d) => d._id));
    const missing = ids.filter((id) => !foundIds.has(id));
    throw new AppError(
      'One or more products were not found in this branch',
      400,
      'REORDER_PRODUCT_NOT_FOUND',
      missing.map((id) => ({ field: 'items.id', message: `Product ${id} not found` })),
    );
  }

  logAuditEvent({
    action: 'products_reordered',
    target: input.branchId,
    userId: actor.userId,
    businessId,
    metadata: { itemCount: input.items.length, ids: input.items.map((it) => it.id) },
  });

  try {
    await publishToChannel(channelFor.branch(businessId, input.branchId), {
      type: 'product.reordered',
      payload: {
        branchId: input.branchId,
        itemCount: input.items.length,
      },
    });
  } catch (err) {
    log.warn({ err, branchId: input.branchId }, 'Reorder persisted but WS publish failed');
  }

  return { matched };
}

function isLowStock(product: Product): boolean {
  return (
    product.trackStock &&
    typeof product.lowStockThreshold === 'number' &&
    product.stock <= product.lowStockThreshold
  );
}

// Mirrors the orders fan-out: publish to the branch channel after the DB write
// has succeeded. Errors are logged but never thrown — the persisted state is
// authoritative; the WS layer is best-effort cache invalidation.
async function fanOutProductEvent(
  product: Product,
  type: 'product.created' | 'product.updated' | 'product.deleted' | 'product.low-stock',
  extra: Record<string, unknown>,
): Promise<void> {
  try {
    await publishToChannel(channelFor.branch(product.businessId, product.branchId), {
      type,
      payload: {
        productId: product._id,
        branchId: product.branchId,
        ...extra,
      },
    });
  } catch (err) {
    log.warn(
      { err, productId: product._id, branchId: product.branchId, type },
      'Product event persisted but WS publish failed',
    );
  }
}

export interface UploadUrlResult {
  uploadUrl: string;
  publicUrl: string;
  expiresIn: number;
}

export async function generateUploadUrl(
  actor: TokenPayload,
  input: UploadUrlInput,
): Promise<UploadUrlResult> {
  assertBranchAccess(actor, input.branchId);

  const bucket = process.env.ASSETS_BUCKET_NAME;
  if (!bucket) {
    throw new AppError(
      'Assets bucket is not configured on this environment',
      503,
      'ASSETS_NOT_CONFIGURED',
    );
  }

  const ext = CONTENT_TYPE_TO_EXT[input.contentType];
  const key = `products/${input.branchId}/${crypto.randomUUID()}.${ext}`;

  const commandInput: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    ContentType: input.contentType,
    ContentLength: input.fileSize,
  };

  const uploadUrl = await getSignedUrl(getS3Client(), new PutObjectCommand(commandInput), {
    expiresIn: UPLOAD_URL_EXPIRES_IN,
  });

  const cdnDomain = process.env.ASSETS_CDN_DOMAIN;
  // Strip the query string off the signed URL to get the raw object URL. This
  // works uniformly for virtual-hosted S3 (`https://bucket.s3.../key`) and for
  // path-style MinIO (`http://localhost:9000/bucket/key`) — previously we
  // rebuilt from `URL.origin + key`, which dropped the bucket segment in
  // path-style mode.
  const publicUrl = cdnDomain ? `https://${cdnDomain}/${key}` : uploadUrl.split('?')[0];

  log.info(
    { branchId: input.branchId, key, contentType: input.contentType, fileSize: input.fileSize },
    'Generated pre-signed upload URL',
  );

  return { uploadUrl, publicUrl, expiresIn: UPLOAD_URL_EXPIRES_IN };
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}
