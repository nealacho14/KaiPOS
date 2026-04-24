import { hasPermission } from '@kaipos/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useActiveBranchContext } from '../context/ActiveBranchContext.js';
import { useAuth } from '../context/AuthContext.js';

export const ACTIVE_BRANCH_STORAGE_KEY = 'kaipos.activeBranchId';
const SEARCH_PARAM = 'branchId';

export interface UseActiveBranchOptions {
  // When true, reads/writes `?branchId=...` in the current location so the
  // page URL reflects the active branch (useful for shareable links). The
  // source of truth is still the `ActiveBranchProvider` context — URL sync
  // is just a one-way mirror into the address bar with a one-time hydration
  // on mount to honor a link opened in a new tab.
  syncToSearchParam?: boolean;
}

export interface UseActiveBranchResult {
  branchId: string | null;
  setBranchId: (id: string) => void;
  branchIds: string[];
  canManage: boolean;
}

export function useActiveBranch(options: UseActiveBranchOptions = {}): UseActiveBranchResult {
  const { syncToSearchParam = false } = options;
  const { user } = useAuth();
  const { selectedBranchId, setSelectedBranchId } = useActiveBranchContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const branchIds = useMemo(() => user?.branchIds ?? [], [user?.branchIds]);
  const canManage = user ? hasPermission(user.role, 'branches:manage') : false;

  // Hydrate from URL on mount if the param is present and differs from the
  // context — this lets a deep link like `/products?branchId=X` win over any
  // previously stored value without breaking subsequent in-app navigations.
  const paramBranchId = syncToSearchParam ? searchParams.get(SEARCH_PARAM) : null;
  useEffect(() => {
    if (!syncToSearchParam) return;
    if (paramBranchId && paramBranchId !== selectedBranchId) {
      setSelectedBranchId(paramBranchId);
    }
  }, [paramBranchId, selectedBranchId, setSelectedBranchId, syncToSearchParam]);

  const branchId = useMemo<string | null>(() => {
    if (selectedBranchId) return selectedBranchId;
    // Single-branch non-manager auto-selects their only branch.
    if (!canManage && branchIds.length === 1) return branchIds[0] ?? null;
    return null;
  }, [selectedBranchId, canManage, branchIds]);

  const setBranchId = useCallback(
    (id: string) => {
      setSelectedBranchId(id);
      if (syncToSearchParam) {
        const next = new URLSearchParams(searchParams);
        next.set(SEARCH_PARAM, id);
        setSearchParams(next, { replace: true });
      }
    },
    [setSelectedBranchId, syncToSearchParam, searchParams, setSearchParams],
  );

  return { branchId, setBranchId, branchIds, canManage };
}
