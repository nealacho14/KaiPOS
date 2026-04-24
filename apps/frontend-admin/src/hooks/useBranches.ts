import { useEffect, useState } from 'react';
import { ApiError, apiJson } from '../lib/api.js';

export interface BranchOption {
  _id: string;
  name: string;
}

interface BranchesResponse {
  branches: BranchOption[];
}

export interface UseBranchesResult {
  branches: BranchOption[];
  loading: boolean;
  error: string | null;
}

export function useBranches(): UseBranchesResult {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiJson<BranchesResponse>('/api/branches')
      .then((data) => {
        if (cancelled) return;
        setBranches(data.branches);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 404 means the endpoint is not deployed yet — surface as "unavailable"
        // without spamming the console.
        if (err instanceof ApiError && err.status !== 404) {
          setError('No pudimos cargar las sucursales.');
        } else {
          setError(null);
        }
        setBranches([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { branches, loading, error };
}
