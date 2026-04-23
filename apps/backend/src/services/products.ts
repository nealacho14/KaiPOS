import type { Filter } from 'mongodb';
import type { Product, TokenPayload } from '@kaipos/shared/types';
import { SUPER_ADMIN_BUSINESS_ID } from '@kaipos/shared/permissions';
import { PutObjectCommand, S3Client, type PutObjectCommandInput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getProductsCollection, getKitchenStationsCollection } from '../db/collections.js';
import { AppError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { canAccessBranch, assertBranchAccess } from '../middleware/branch-access.js';
import type {
  CreateProductInput,
  ListProductsQuery,
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

let s3ClientSingleton: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3ClientSingleton) {
    s3ClientSingleton = new S3Client({});
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
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { sku: { $regex: escaped, $options: 'i' } },
    ];
  }

  return filter;
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
): Promise<Product[]> {
  const products = await getProductsCollection();
  const filter = buildListFilter(actor, query);
  return products.find(filter).toArray();
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
  const publicUrl = cdnDomain
    ? `https://${cdnDomain}/${key}`
    : new URL(uploadUrl).origin + `/${key}`;

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
