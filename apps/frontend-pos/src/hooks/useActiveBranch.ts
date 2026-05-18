import { hasPermission } from '@kaipos/shared';
import { useCallback, useMemo } from 'react';
import { useActiveBranchContext } from '../context/ActiveBranchContext.js';
import { useAuth } from '../context/AuthContext.js';

export const ACTIVE_BRANCH_STORAGE_KEY = 'kaipos.activeBranchId';

export interface UseActiveBranchResult {
  branchId: string | null;
  setBranchId: (id: string) => void;
  branchIds: string[];
  canManage: boolean;
}

// Reads the app-wide active branch from `ActiveBranchProvider`. The context is
// persisted in sessionStorage, so changing the branch in the header propagates
// to every consumer of this hook.
export function useActiveBranch(): UseActiveBranchResult {
  const { user } = useAuth();
  const { selectedBranchId, setSelectedBranchId } = useActiveBranchContext();

  const branchIds = useMemo(() => user?.branchIds ?? [], [user?.branchIds]);
  const canManage = user ? hasPermission(user.role, 'branches:manage') : false;

  const branchId = useMemo<string | null>(() => {
    if (selectedBranchId) return selectedBranchId;
    // Single-branch non-manager auto-selects their only branch.
    if (!canManage && branchIds.length === 1) return branchIds[0] ?? null;
    return null;
  }, [selectedBranchId, canManage, branchIds]);

  const setBranchId = useCallback(
    (id: string) => {
      setSelectedBranchId(id);
    },
    [setSelectedBranchId],
  );

  return { branchId, setBranchId, branchIds, canManage };
}
