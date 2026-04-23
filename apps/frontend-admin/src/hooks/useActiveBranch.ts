import { hasPermission } from '@kaipos/shared';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

const STORAGE_KEY = 'kaipos.activeBranchId';
const SEARCH_PARAM = 'branchId';

export interface UseActiveBranchOptions {
  syncToSearchParam?: boolean;
}

export interface UseActiveBranchResult {
  branchId: string | null;
  setBranchId: (id: string) => void;
  branchIds: string[];
  canManage: boolean;
}

function readStored(): string | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

function writeStored(id: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // sessionStorage may be unavailable (private mode, etc.) — treat as ephemeral.
  }
}

export function useActiveBranch(options: UseActiveBranchOptions = {}): UseActiveBranchResult {
  const { syncToSearchParam = false } = options;
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const branchIds = useMemo(() => user?.branchIds ?? [], [user?.branchIds]);
  const canManage = user ? hasPermission(user.role, 'branches:manage') : false;

  // Explicit user selection is the only thing we keep in state. The *effective*
  // branchId is derived from (override → url → storage → auto-select) on each
  // render, which keeps the hook free of setState-in-effect cascades.
  const [override, setOverride] = useState<string | null>(null);

  const paramBranchId = syncToSearchParam ? searchParams.get(SEARCH_PARAM) : null;

  const branchId = useMemo<string | null>(() => {
    if (override) return override;
    if (paramBranchId) return paramBranchId;
    const stored = readStored();
    if (stored) return stored;
    if (!canManage && branchIds.length === 1) return branchIds[0] ?? null;
    return null;
  }, [override, paramBranchId, canManage, branchIds]);

  const setBranchId = useCallback(
    (id: string) => {
      setOverride(id);
      writeStored(id);
      if (syncToSearchParam) {
        const next = new URLSearchParams(searchParams);
        next.set(SEARCH_PARAM, id);
        setSearchParams(next, { replace: true });
      }
    },
    [syncToSearchParam, searchParams, setSearchParams],
  );

  return { branchId, setBranchId, branchIds, canManage };
}
