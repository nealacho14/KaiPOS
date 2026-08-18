import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ACTIVE_BRANCH_STORAGE_KEY } from '../hooks/useActiveBranch.js';

interface ActiveBranchContextValue {
  // Explicit selection (null means "not yet chosen"). Auto-selection for
  // single-branch users is derived in `useActiveBranch`, which consumes this.
  selectedBranchId: string | null;
  setSelectedBranchId: (id: string | null) => void;
}

const ActiveBranchContext = createContext<ActiveBranchContextValue | null>(null);

function readStored(): string | null {
  try {
    return typeof window !== 'undefined'
      ? window.sessionStorage.getItem(ACTIVE_BRANCH_STORAGE_KEY)
      : null;
  } catch {
    return null;
  }
}

function writeStored(id: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (id) {
      window.sessionStorage.setItem(ACTIVE_BRANCH_STORAGE_KEY, id);
    } else {
      window.sessionStorage.removeItem(ACTIVE_BRANCH_STORAGE_KEY);
    }
  } catch {
    // sessionStorage may be unavailable (private mode, etc.)
  }
}

export function ActiveBranchProvider({ children }: { children: ReactNode }) {
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | null>(() => readStored());

  const setSelectedBranchId = useCallback((id: string | null) => {
    setSelectedBranchIdState(id);
    writeStored(id);
  }, []);

  return (
    <ActiveBranchContext.Provider value={{ selectedBranchId, setSelectedBranchId }}>
      {children}
    </ActiveBranchContext.Provider>
  );
}

export function useActiveBranchContext(): ActiveBranchContextValue {
  const ctx = useContext(ActiveBranchContext);
  if (!ctx) {
    throw new Error('useActiveBranchContext must be used inside ActiveBranchProvider');
  }
  return ctx;
}
