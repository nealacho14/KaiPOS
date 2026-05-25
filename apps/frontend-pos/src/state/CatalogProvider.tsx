import type { Product } from '@kaipos/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { listProducts, type ListProductsParams } from '../lib/products-api.js';
import { logger } from '../lib/logger.js';

export type CatalogStatus = 'idle' | 'loading' | 'partial' | 'ready' | 'error';

export interface CatalogQuery {
  branchId: string;
  category?: string;
  q?: string;
  activeNow?: boolean;
  featuredIn?: string;
}

export interface CatalogEntry {
  data: Product[];
  totalPages: number;
  pagesFetched: number;
  status: CatalogStatus;
  error?: string;
}

interface CatalogContextValue {
  entries: Record<string, CatalogEntry>;
  ensureLoaded: (query: CatalogQuery) => void;
  retry: (query: CatalogQuery) => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

const PAGE_LIMIT = 100;
// Cap background concurrency so we do not flood API Gateway with N parallel
// fetches per active tab. 5 chosen to stay under the browser's ~6 in-flight
// per origin keep-alive ceiling.
const MAX_CONCURRENT_PAGES = 5;

const EMPTY_ENTRY: CatalogEntry = {
  data: [],
  totalPages: 0,
  pagesFetched: 0,
  status: 'idle',
};

export function catalogKey(q: CatalogQuery): string {
  return [
    q.branchId,
    q.category ?? '',
    q.q?.trim() ?? '',
    q.activeNow ? '1' : '0',
    q.featuredIn ?? '',
  ].join('|');
}

function toParams(q: CatalogQuery, page: number): ListProductsParams {
  return {
    branchId: q.branchId,
    category: q.category,
    q: q.q?.trim() || undefined,
    activeNow: q.activeNow,
    featuredIn: q.featuredIn,
    page,
    limit: PAGE_LIMIT,
  };
}

function dedupeById(input: Product[]): Product[] {
  const seen = new Set<string>();
  const out: Product[] = [];
  for (const p of input) {
    if (seen.has(p._id)) continue;
    seen.add(p._id);
    out.push(p);
  }
  return out;
}

async function fetchInPool<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<Array<{ ok: true; value: T } | { ok: false; error: unknown }>> {
  const results: Array<{ ok: true; value: T } | { ok: false; error: unknown }> = new Array(
    tasks.length,
  );
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < tasks.length) {
      const idx = cursor++;
      const task = tasks[idx];
      if (!task) return;
      try {
        const value = await task();
        results[idx] = { ok: true, value };
      } catch (error) {
        results[idx] = { ok: false, error };
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, CatalogEntry>>({});
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const fetchInflight = useRef<Map<string, Promise<void>>>(new Map());
  const activeKeyRef = useRef<string | null>(null);

  const setEntry = useCallback((key: string, updater: (prev: CatalogEntry) => CatalogEntry) => {
    setEntries((prev) => {
      const current = prev[key] ?? EMPTY_ENTRY;
      const next = updater(current);
      if (next === current) return prev;
      return { ...prev, [key]: next };
    });
  }, []);

  const fetchAll = useCallback(
    async (query: CatalogQuery) => {
      const key = catalogKey(query);
      if (!query.branchId) return;

      activeKeyRef.current = key;
      setEntry(key, (prev) => ({ ...prev, status: 'loading', error: undefined }));

      try {
        const first = await listProducts(toParams(query, 1));
        // Abandoned mid-flight (user switched query). Drop the placeholder
        // `loading` entry so a revisit re-enters `ensureLoaded` and refetches
        // — otherwise the cache stays stuck on `loading` forever and
        // `ensureLoaded` short-circuits subsequent calls for the same key.
        if (activeKeyRef.current !== key) {
          setEntry(key, () => EMPTY_ENTRY);
          return;
        }

        const totalPages = Math.max(1, first.pagination.totalPages ?? 1);
        setEntry(key, () => ({
          data: first.data,
          totalPages,
          pagesFetched: 1,
          status: totalPages > 1 ? 'partial' : 'ready',
        }));

        if (totalPages <= 1) return;

        const tasks: Array<() => Promise<{ page: number; data: Product[] }>> = [];
        for (let page = 2; page <= totalPages; page += 1) {
          tasks.push(async () => {
            const res = await listProducts(toParams(query, page));
            return { page, data: res.data };
          });
        }
        const results = await fetchInPool(tasks, MAX_CONCURRENT_PAGES);
        // Abandoned after page 1 already rendered. Page 1 stays in the cache
        // as `partial`; revisits refetch via the retry control rather than
        // automatically, which matches the user's last-seen state.
        if (activeKeyRef.current !== key) return;

        const failures = results.filter((r) => !r.ok);
        const merged: Product[] = [];
        for (const r of results) {
          if (r.ok) merged.push(...r.value.data);
        }

        setEntry(key, (prev) => ({
          ...prev,
          data: dedupeById([...prev.data, ...merged]),
          pagesFetched: prev.pagesFetched + results.length - failures.length,
          status: failures.length === 0 ? 'ready' : 'partial',
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        logger.error('catalog.fetch failed', { key, message });
        // Even if the key was abandoned, drop back to `idle` so a revisit
        // refetches instead of seeing a stale `loading` entry.
        if (activeKeyRef.current !== key) {
          setEntry(key, () => EMPTY_ENTRY);
          return;
        }
        setEntry(key, (prev) => ({ ...prev, status: 'error', error: message }));
      }
    },
    [setEntry],
  );

  const ensureLoaded = useCallback(
    (query: CatalogQuery) => {
      if (!query.branchId) return;
      const key = catalogKey(query);
      activeKeyRef.current = key;

      const current = entriesRef.current[key];
      if (current && current.status !== 'idle' && current.status !== 'error') {
        return;
      }
      if (fetchInflight.current.has(key)) return;

      const promise = fetchAll(query).finally(() => {
        fetchInflight.current.delete(key);
      });
      fetchInflight.current.set(key, promise);
    },
    [fetchAll],
  );

  const retry = useCallback(
    (query: CatalogQuery) => {
      const key = catalogKey(query);
      setEntry(key, () => EMPTY_ENTRY);
      fetchInflight.current.delete(key);
      ensureLoaded(query);
    },
    [ensureLoaded, setEntry],
  );

  const value = useMemo<CatalogContextValue>(
    () => ({ entries, ensureLoaded, retry }),
    [entries, ensureLoaded, retry],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalogContext(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) {
    throw new Error('useCatalogContext must be used within a <CatalogProvider>');
  }
  return ctx;
}

// Convenience hook: subscribes to one cache key and kicks off the load.
//
// `key` captures every dimension of `query`. We stash `query` on a ref so the
// effect can rerun only when the derived key changes — running on `query`
// identity churn would defeat the cache, and the canonical `eslint-disable
// react-hooks/exhaustive-deps` directive isn't recognized by the root pre-
// commit eslint config (no react-hooks plugin there).
export function useCatalog(query: CatalogQuery): CatalogEntry {
  const { entries, ensureLoaded } = useCatalogContext();
  const key = catalogKey(query);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    if (!queryRef.current.branchId) return;
    ensureLoaded(queryRef.current);
  }, [key, ensureLoaded]);

  return entries[key] ?? EMPTY_ENTRY;
}
