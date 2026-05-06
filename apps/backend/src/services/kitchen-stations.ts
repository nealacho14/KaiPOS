import type { KitchenStation, TokenPayload } from '@kaipos/shared/types';
import { SUPER_ADMIN_BUSINESS_ID } from '@kaipos/shared/permissions';
import { getKitchenStationsCollection } from '../db/collections.js';
import { paginate, type PaginatedResult } from '../lib/paginate.js';
import { AppError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { assertBranchAccess } from '../middleware/branch-access.js';
import type { CreateKitchenStationInput } from '../schemas/kitchen-stations.js';

const log = createLogger({ module: 'kitchen-stations-service' });

function resolveBusinessId(actor: TokenPayload): string {
  // Tenant scoping only — `super_admin` carries the sentinel `*` and has no
  // concrete business context on their token. The current routes reject them
  // upstream via `requireBranchAccess`; this is a belt-and-suspenders guard in
  // case the service is called from elsewhere.
  if (actor.businessId === SUPER_ADMIN_BUSINESS_ID) {
    throw new AppError(
      'super_admin cannot call kitchen station routes without a concrete business context',
      400,
      'MISSING_TARGET_BUSINESS_ID',
    );
  }
  return actor.businessId;
}

export async function listByBranch(
  actor: TokenPayload,
  branchId: string,
  pagination: { page: number; limit: number } = { page: 1, limit: 50 },
): Promise<PaginatedResult<KitchenStation>> {
  assertBranchAccess(actor, branchId);
  const businessId = resolveBusinessId(actor);
  const collection = await getKitchenStationsCollection();
  return paginate({
    collection,
    filter: { businessId, branchId },
    page: pagination.page,
    limit: pagination.limit,
  });
}

export async function create(
  actor: TokenPayload,
  input: CreateKitchenStationInput,
): Promise<KitchenStation> {
  assertBranchAccess(actor, input.branchId);
  const businessId = resolveBusinessId(actor);
  const collection = await getKitchenStationsCollection();

  const existing = await collection.findOne({
    businessId,
    branchId: input.branchId,
    name: input.name,
  });
  if (existing) {
    throw new AppError(
      'A kitchen station with this name already exists in this branch',
      409,
      'DUPLICATE_STATION_NAME',
      [{ field: 'name', message: 'Station name already exists in this branch' }],
    );
  }

  const now = new Date();
  const station: KitchenStation = {
    _id: crypto.randomUUID(),
    businessId,
    branchId: input.branchId,
    name: input.name,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.userId,
  };

  try {
    await collection.insertOne(station);
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 11000
    ) {
      throw new AppError(
        'A kitchen station with this name already exists in this branch',
        409,
        'DUPLICATE_STATION_NAME',
        [{ field: 'name', message: 'Station name already exists in this branch' }],
      );
    }
    throw err;
  }

  log.info(
    { stationId: station._id, businessId, branchId: input.branchId },
    'Kitchen station created',
  );

  return station;
}
