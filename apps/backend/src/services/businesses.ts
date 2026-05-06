import type { Business, TokenPayload } from '@kaipos/shared';
import { SUPER_ADMIN_BUSINESS_ID } from '@kaipos/shared';
import { getBusinessesCollection } from '../db/collections.js';
import { ForbiddenError } from '../lib/errors.js';

export interface BusinessSummary {
  _id: string;
  name: string;
  slug: string;
}

// Currently only super_admin needs to enumerate businesses (for the in-app
// business picker). Regular users are scoped to their own business via the
// JWT — they can read it via /api/auth/me. If we ever expose this to admins,
// we'd add a `?ownByActor=true` filter and tighten the gate accordingly.
export async function listBusinessesForSuperAdmin(actor: TokenPayload): Promise<BusinessSummary[]> {
  if (actor.businessId !== SUPER_ADMIN_BUSINESS_ID) {
    throw new ForbiddenError('Only super_admin can list businesses');
  }
  const businesses = await getBusinessesCollection();
  const docs = await businesses
    .find({ isActive: true } as Partial<Business>)
    .sort({ name: 1 })
    .toArray();
  return docs.map((b) => ({ _id: b._id, name: b.name, slug: b.slug }));
}
