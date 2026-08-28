import type { ProductPreference, TokenPayload } from '@kaipos/shared/types';
import { channelFor } from '@kaipos/shared/types';
import { SUPER_ADMIN_BUSINESS_ID } from '@kaipos/shared/permissions';
import { getProductPreferencesCollection, getProductsCollection } from '../db/collections.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { publishToChannel } from '../lib/ws-publish.js';
import { canAccessBranch } from '../middleware/branch-access.js';
import type { FeatureProductInput } from '../schemas/products.js';
import { logAuditEvent } from './audit.js';

const log = createLogger({ module: 'product-preferences-service' });

/**
 * Ids of the products currently featured in a branch.
 *
 * The featured flag lives in `productPreferences`, not on the product doc, so
 * `listProducts` cannot return it without an aggregation — and that list path
 * is hand-tuned (index + collation + `_id` tiebreaker) and not worth
 * destabilising for a star icon. This read is backed by the
 * `{businessId, branchId, featured}` index and the featured set per branch is
 * small by nature, so the whole set comes back in one go.
 */
export async function listFeaturedProductIds(
  actor: TokenPayload,
  branchId: string,
): Promise<string[]> {
  if (!canAccessBranch(actor, branchId)) {
    throw new ForbiddenError('Access denied to this branch');
  }

  const prefs = await getProductPreferencesCollection();
  // super_admin is scoped by the branch it asked for rather than by businessId,
  // mirroring how the rest of the service treats the wildcard business.
  const filter =
    actor.businessId === SUPER_ADMIN_BUSINESS_ID
      ? { branchId, featured: true }
      : { businessId: actor.businessId, branchId, featured: true };

  const rows = await prefs.find(filter, { projection: { productId: 1, _id: 0 } }).toArray();
  return rows.map((row) => row.productId);
}

/**
 * Mark / unmark a product as featured in a branch. Per-branch + per-product
 * is enforced by the unique index on `productPreferences`. Idempotent: setting
 * the same value twice produces the same row.
 *
 * Audit + WS fan-out fire only when a write actually happened (i.e. created
 * or modified the doc) — calling setFeatured with the same value on the same
 * branch shouldn't spam the channel.
 */
export async function setFeatured(
  actor: TokenPayload,
  productId: string,
  input: FeatureProductInput,
): Promise<ProductPreference> {
  const products = await getProductsCollection();
  const product = await products.findOne({ _id: productId });
  if (!product) {
    throw new NotFoundError('Product');
  }

  if (actor.businessId !== SUPER_ADMIN_BUSINESS_ID && product.businessId !== actor.businessId) {
    throw new NotFoundError('Product');
  }

  if (product.branchId !== input.branchId) {
    // A product lives in a single branch. Featuring it in a different branch
    // would create an orphan preference — reject with 404 to avoid leaking
    // existence across branches.
    throw new NotFoundError('Product');
  }

  if (!canAccessBranch(actor, input.branchId)) {
    throw new ForbiddenError('Access denied to this branch');
  }

  const prefs = await getProductPreferencesCollection();
  const now = new Date();

  const existing = await prefs.findOne({
    businessId: product.businessId,
    branchId: input.branchId,
    productId,
  });

  const updated = await prefs.findOneAndUpdate(
    { businessId: product.businessId, branchId: input.branchId, productId },
    {
      $set: {
        featured: input.featured,
        updatedAt: now,
        updatedBy: actor.userId,
      },
      $setOnInsert: {
        _id: crypto.randomUUID(),
        businessId: product.businessId,
        branchId: input.branchId,
        productId,
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  if (!updated) {
    throw new NotFoundError('ProductPreference');
  }

  const stateChanged = !existing || existing.featured !== input.featured;
  if (stateChanged) {
    logAuditEvent({
      action: input.featured ? 'product_featured' : 'product_unfeatured',
      target: productId,
      userId: actor.userId,
      businessId: product.businessId,
      metadata: { branchId: input.branchId },
    });

    try {
      // Distinct from `product.updated` so the UI can refresh just the
      // "featured" tab/state without invalidating the full product card.
      // The full doc didn't change here — only the per-branch preference did.
      await publishToChannel(channelFor.branch(product.businessId, input.branchId), {
        type: 'product.featured',
        payload: {
          productId,
          branchId: input.branchId,
          featured: input.featured,
        },
      });
    } catch (err) {
      log.warn(
        { err, productId, branchId: input.branchId },
        'Featured state persisted but WS publish failed',
      );
    }
  }

  return updated;
}
